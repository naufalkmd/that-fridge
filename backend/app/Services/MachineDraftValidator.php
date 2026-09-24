<?php

namespace App\Services;

use App\Models\User;
use App\Support\ItemPayload;

/**
 * Validates a drafted (or hand-edited) Machine's {name, trigger, steps} - the same validation
 * runs whether a draft came from AgentService::draftMachine or a client save/PATCH, since
 * either one could name a tool that isn't Machine-eligible or pass it bad arguments. Returns
 * a clean, normalized draft or a list of plain-English errors (never both), so a caller can
 * either persist the draft or feed the errors back for a repair round-trip.
 */
class MachineDraftValidator
{
    private const TRIGGER_TYPES = ['schedule', 'item_added', 'threshold'];

    private const FREQUENCIES = ['daily', 'weekly'];

    private const THRESHOLD_OPS = ['lt', 'lte', 'gt', 'gte'];

    private const MAX_STEPS = 10;

    public function __construct(protected AgentToolbox $toolbox) {}

    /**
     * @return array{valid: bool, errors: string[], draft: ?array}
     */
    public function validate(array $draft, User $user): array
    {
        $errors = [];

        $name = trim((string) ($draft['name'] ?? ''));
        if ($name === '') {
            $errors[] = 'name is required.';
        } elseif (mb_strlen($name) > 60) {
            $name = mb_substr($name, 0, 60);
        }

        $trigger = $this->validateTrigger($draft['trigger'] ?? null, $errors);
        $steps = $this->validateSteps($draft['steps'] ?? null, $errors, $user);

        if ($errors !== []) {
            return ['valid' => false, 'errors' => $errors, 'draft' => null];
        }

        return [
            'valid' => true,
            'errors' => [],
            'draft' => [
                'name' => $name,
                'trigger_type' => $trigger['type'],
                'trigger_config' => $trigger['config'],
                'steps' => $steps,
            ],
        ];
    }

    /** @param  string[]  $errors */
    private function validateTrigger(mixed $trigger, array &$errors): ?array
    {
        if (! is_array($trigger) || ! isset($trigger['type'])) {
            $errors[] = 'trigger is required, with a type of schedule, item_added, or threshold.';

            return null;
        }

        $type = $trigger['type'];
        if (! in_array($type, self::TRIGGER_TYPES, true)) {
            $errors[] = 'trigger.type must be one of '.implode(', ', self::TRIGGER_TYPES).'.';

            return null;
        }

        $config = is_array($trigger['config'] ?? null) ? $trigger['config'] : [];
        $before = count($errors);

        $result = match ($type) {
            'schedule' => $this->validateScheduleTrigger($config, $errors),
            'item_added' => $this->validateItemAddedTrigger($config),
            'threshold' => $this->validateThresholdTrigger($config, $errors),
        };

        return count($errors) > $before ? null : $result;
    }

    /** @param  string[]  $errors */
    private function validateScheduleTrigger(array $config, array &$errors): array
    {
        $frequency = $config['frequency'] ?? null;
        if (! in_array($frequency, self::FREQUENCIES, true)) {
            $errors[] = 'trigger.config.frequency must be daily or weekly.';
        }

        $time = $config['time'] ?? null;
        if (! is_string($time) || ! preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
            $errors[] = 'trigger.config.time must be HH:MM (24-hour).';
        }

        $weekday = null;
        if ($frequency === 'weekly') {
            $raw = $config['weekday'] ?? null;
            if (! is_numeric($raw) || (int) $raw < 0 || (int) $raw > 6) {
                $errors[] = 'trigger.config.weekday is required for a weekly schedule, 0 (Sunday) to 6 (Saturday).';
            } else {
                $weekday = (int) $raw;
            }
        }

        $timezone = is_string($config['timezone'] ?? null) && $config['timezone'] !== '' ? $config['timezone'] : 'UTC';

        return ['type' => 'schedule', 'config' => [
            'frequency' => $frequency, 'time' => $time, 'weekday' => $weekday, 'timezone' => $timezone,
        ]];
    }

    private function validateItemAddedTrigger(array $config): array
    {
        $search = isset($config['search']) && trim((string) $config['search']) !== '' ? trim((string) $config['search']) : null;
        $location = in_array($config['location'] ?? null, ['fridge', 'freezer', 'pantry'], true) ? $config['location'] : null;

        return ['type' => 'item_added', 'config' => ['search' => $search, 'location' => $location]];
    }

    /** @param  string[]  $errors */
    private function validateThresholdTrigger(array $config, array &$errors): array
    {
        $field = $config['field'] ?? null;
        if (! in_array($field, AgentToolbox::FIELDS, true)) {
            $errors[] = 'trigger.config.field must be one of '.implode(', ', AgentToolbox::FIELDS).'.';
        }

        $op = $config['op'] ?? null;
        if (! in_array($op, self::THRESHOLD_OPS, true)) {
            $errors[] = 'trigger.config.op must be one of '.implode(', ', self::THRESHOLD_OPS).'.';
        }

        if (! is_numeric($config['value'] ?? null)) {
            $errors[] = 'trigger.config.value must be a number.';
        }

        $unit = $config['unit'] ?? null;
        if ($field === 'weight' && (! is_string($unit) || ! in_array($unit, ItemPayload::WEIGHT_UNITS, true))) {
            $errors[] = 'trigger.config.unit is required (one of '.implode(', ', ItemPayload::WEIGHT_UNITS).') when field is weight.';
        }

        $customFieldLabel = trim((string) ($config['custom_field_label'] ?? ''));
        if ($field === 'custom' && $customFieldLabel === '') {
            $errors[] = 'trigger.config.custom_field_label is required when field is custom.';
        }

        return ['type' => 'threshold', 'config' => [
            'field' => $field,
            'custom_field_label' => $field === 'custom' ? $customFieldLabel : null,
            'unit' => $field === 'weight' ? $unit : null,
            'filter' => is_array($config['filter'] ?? null) ? $config['filter'] : [],
            'op' => $op,
            'value' => is_numeric($config['value'] ?? null) ? (float) $config['value'] : null,
        ]];
    }

    /** @param  string[]  $errors */
    private function validateSteps(mixed $steps, array &$errors, User $user): ?array
    {
        if (! is_array($steps) || $steps === []) {
            $errors[] = 'steps must have at least one step.';

            return null;
        }
        if (count($steps) > self::MAX_STEPS) {
            $errors[] = 'a Machine can have at most '.self::MAX_STEPS.' steps.';

            return null;
        }

        $schemasByName = collect($this->toolbox->schemas('machine'))
            ->keyBy(fn ($t) => $t['function']['name']);
        $userFridgeIds = $user->memberFridges()->pluck('fridges.id');

        $clean = [];
        $stepTools = [];
        foreach (array_values($steps) as $i => $step) {
            $n = $i + 1;
            if (! is_array($step) || ! isset($step['tool'])) {
                $errors[] = "step {$n}: missing \"tool\".";

                continue;
            }

            $tool = $step['tool'];
            $stepTools[$n] = $tool;
            $schema = $schemasByName->get($tool);
            if (! $schema) {
                $errors[] = "step {$n}: \"{$tool}\" isn't a tool a Machine can use.";

                continue;
            }

            $args = is_array($step['args'] ?? null) ? $step['args'] : [];
            $argErrors = $this->validateArgs($args, $schema['function']['parameters'], $n);

            // Type-correct doesn't mean owned - a fridge_id could be well-formed but belong
            // to someone else. AgentToolbox's own runtime checks would just silently ignore
            // or fall back on a foreign fridge_id rather than error, so catching it here
            // means a bad edit fails loudly at save time instead of quietly misbehaving on
            // every future run.
            if ($argErrors === [] && isset($args['fridge_id']) && ! $userFridgeIds->contains((int) $args['fridge_id'])) {
                $argErrors[] = "step {$n}: fridge_id doesn't belong to you.";
            }

            $placeholderError = $argErrors === [] ? $this->validatePlaceholders($args, $n) : null;

            $condition = null;
            $conditionError = null;
            if ($argErrors === [] && $placeholderError === null && isset($step['condition'])) {
                [$condition, $conditionError] = $this->validateCondition($step['condition'], $n, $stepTools);
            }

            if ($argErrors !== [] || $placeholderError !== null || $conditionError !== null) {
                array_push($errors, ...$argErrors);
                if ($placeholderError !== null) {
                    $errors[] = $placeholderError;
                }
                if ($conditionError !== null) {
                    $errors[] = $conditionError;
                }

                continue;
            }

            $row = ['tool' => $tool, 'args' => $args];
            if ($condition !== null) {
                $row['condition'] = $condition;
            }
            $clean[] = $row;
        }

        return $errors === [] ? $clean : null;
    }

    /**
     * A step may run conditionally on an earlier sum_item_field step's computed number - the
     * only Machine-eligible tool that produces one (AgentToolbox::run()'s `value` is null for
     * every other tool). Reuses the same lt/lte/gt/gte vocabulary a threshold trigger already
     * has - deliberately a guard clause, not a general expression language.
     *
     * @return array{0: ?array, 1: ?string}
     */
    private function validateCondition(mixed $condition, int $stepNumber, array $stepTools): array
    {
        if (! is_array($condition)) {
            return [null, "step {$stepNumber}: condition must be an object."];
        }

        $ref = $condition['step'] ?? null;
        if (! is_numeric($ref)) {
            return [null, "step {$stepNumber}: condition.step must be a step number."];
        }
        $ref = (int) $ref;
        if ($ref < 1 || $ref >= $stepNumber) {
            return [null, "step {$stepNumber}: condition.step must reference an earlier step."];
        }
        if (($stepTools[$ref] ?? null) !== 'sum_item_field') {
            return [null, "step {$stepNumber}: condition.step must reference a sum_item_field step - that's the only tool with a number to compare."];
        }

        $op = $condition['op'] ?? null;
        if (! in_array($op, self::THRESHOLD_OPS, true)) {
            return [null, "step {$stepNumber}: condition.op must be one of ".implode(', ', self::THRESHOLD_OPS).'.'];
        }

        if (! is_numeric($condition['value'] ?? null)) {
            return [null, "step {$stepNumber}: condition.value must be a number."];
        }

        return [['step' => $ref, 'op' => $op, 'value' => (float) $condition['value']], null];
    }

    /**
     * Validates $args against one tool's own parameters schema - type/enum/required only,
     * the subset schemas() actually uses, so no JSON-schema library is needed.
     *
     * @return string[]
     */
    private function validateArgs(array $args, array $parameters, int $stepNumber): array
    {
        $errors = [];
        $properties = (array) ($parameters['properties'] ?? []);
        $required = $parameters['required'] ?? [];

        foreach ($required as $key) {
            if (! array_key_exists($key, $args) || $args[$key] === null || $args[$key] === '') {
                $errors[] = "step {$stepNumber}: \"{$key}\" is required.";
            }
        }

        foreach ($args as $key => $value) {
            if (! array_key_exists($key, $properties)) {
                $errors[] = "step {$stepNumber}: \"{$key}\" isn't a valid argument for this tool.";

                continue;
            }

            $spec = (array) $properties[$key];
            $types = (array) ($spec['type'] ?? []);

            if ($value === null) {
                if ($types !== [] && ! in_array('null', $types, true)) {
                    $errors[] = "step {$stepNumber}: \"{$key}\" can't be null.";
                }

                continue;
            }

            if ($types !== [] && ! collect($types)->contains(fn ($t) => $this->matchesJsonType($value, $t))) {
                $errors[] = "step {$stepNumber}: \"{$key}\" has the wrong type (expected ".implode(' or ', $types).').';

                continue;
            }

            if (isset($spec['enum']) && ! in_array($value, $spec['enum'], true)) {
                $errors[] = "step {$stepNumber}: \"{$key}\" must be one of ".implode(', ', $spec['enum']).'.';
            }
        }

        return $errors;
    }

    private function matchesJsonType(mixed $value, string $type): bool
    {
        return match ($type) {
            'string' => is_string($value),
            'integer' => is_int($value) || (is_numeric($value) && (float) $value === floor((float) $value)),
            'number' => is_numeric($value),
            'boolean' => is_bool($value),
            'array' => is_array($value),
            default => true,
        };
    }

    /** {stepN} may only appear inside a string arg, and N must be an earlier step - the only
     *  placeholder syntax a Machine's steps support, deliberately not a general expression
     *  language. */
    private function validatePlaceholders(array $args, int $stepNumber): ?string
    {
        foreach ($args as $value) {
            if (! is_string($value)) {
                continue;
            }
            if (preg_match_all('/\{step(\d+)\}/', $value, $matches)) {
                foreach ($matches[1] as $ref) {
                    if ((int) $ref >= $stepNumber) {
                        return "step {$stepNumber}: {step{$ref}} references a step that hasn't run yet - only earlier steps can be referenced.";
                    }
                }
            }
        }

        return null;
    }
}
