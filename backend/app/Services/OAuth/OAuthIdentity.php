<?php

namespace App\Services\OAuth;

/**
 * The verified result of a social sign-in token. `sub` is the provider's stable, opaque user
 * id — the thing we match a returning user on. `email` can be a private relay address (Apple
 * "Hide My Email"); `name` is only ever present on the very first Apple sign-in.
 */
readonly class OAuthIdentity
{
    public function __construct(
        public string $provider,
        public string $sub,
        public ?string $email,
        public bool $emailVerified,
        public ?string $name = null,
    ) {}
}
