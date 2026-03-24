<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function admin(Request $request): ?User
    {
        $admin = $request->attributes->get('adminUser');

        return $admin instanceof User ? $admin : null;
    }
}
