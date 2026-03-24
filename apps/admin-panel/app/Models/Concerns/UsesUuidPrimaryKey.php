<?php

namespace App\Models\Concerns;

trait UsesUuidPrimaryKey
{
    public $incrementing = false;

    protected $keyType = 'string';
}
