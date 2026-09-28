<?php

namespace App\Http\Controllers;

use App\Support\FoodGroupClassifier;
use Illuminate\Http\Request;

class FoodGroupController extends Controller
{
    /**
     * The food group for each name, from FoodGroupClassifier::resolve (keyword rules, the icon,
     * then answers the AI gave for the same name before) - no AI call, no credits. Null where
     * it can't tell. Organizer's Activate plan uses it to file items, so the app and server agree.
     */
    public function classify(Request $request)
    {
        $data = $request->validate([
            'items' => ['required', 'array', 'max:30'],
            'items.*.name' => ['required', 'string', 'max:255'],
            'items.*.icon' => ['nullable', 'string', 'max:255'],
        ]);

        return response()->json([
            'groups' => array_map(
                fn ($i) => FoodGroupClassifier::resolve($i['name'], $i['icon'] ?? null),
                $data['items'],
            ),
        ]);
    }
}
