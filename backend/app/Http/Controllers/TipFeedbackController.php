<?php

namespace App\Http\Controllers;

use App\Support\AlgoFeedback;
use Illuminate\Http\Request;

/** Home crew-tip taps and dismissals - client-only interactions, logged as fixed enums only. */
class TipFeedbackController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'tip' => ['required', 'in:guardian,lowStock,chef'],
            'action' => ['required', 'in:opened,dismissed'],
        ]);

        AlgoFeedback::record($request->user(), 'home_tip', [
            'kind' => $data['action'], 'class' => $data['tip'], 'source' => 'home',
            'outcome' => $data['action'],
        ]);

        return response()->noContent();
    }
}
