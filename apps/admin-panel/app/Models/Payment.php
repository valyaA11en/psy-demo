<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    use UsesUuidPrimaryKey;

    protected $table = 'payments';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'metadata_json' => 'array',
            'paid_at' => 'datetime',
            'refunded_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function consultation(): BelongsTo
    {
        return $this->belongsTo(Consultation::class, 'consultation_id', 'id');
    }
}
