<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Review extends Model
{
    use UsesUuidPrimaryKey;

    protected $table = 'reviews';

    protected $guarded = [];

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function consultation(): BelongsTo
    {
        return $this->belongsTo(Consultation::class, 'consultation_id', 'id');
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_user_id', 'id');
    }

    public function psychologist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'psychologist_user_id', 'id');
    }
}
