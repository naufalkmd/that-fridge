<?php

namespace App\Http\Controllers;

use App\Services\CreditService;
use Illuminate\Http\Request;

class CreditController extends Controller
{
    public function __construct(protected CreditService $credits) {}

    /** The user's current AI-credit balance + recent movements. */
    public function show(Request $request)
    {
        return response()->json([
            'balance' => $this->credits->balance($request->user()),
            'ledger' => $this->credits->recentLedger($request->user()),
        ]);
    }
}
