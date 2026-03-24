<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Consultation extends Model
{
    use UsesUuidPrimaryKey;

    protected $table = 'consultations';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(User::class, 'client_user_id', 'id');
    }

    public function psychologist(): BelongsTo
    {
        return $this->belongsTo(User::class, 'psychologist_user_id', 'id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class, 'consultation_id', 'id');
    }
}
