<?php

namespace App\Models\Concerns;

trait UsesUuidPrimaryKey
{
    public function initializeUsesUuidPrimaryKey(): void
    {
        $this->incrementing = false;
        $this->keyType = 'string';
    }
}
