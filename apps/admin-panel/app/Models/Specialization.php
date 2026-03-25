<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Specialization extends Model
{
    use UsesUuidPrimaryKey;

    protected $table = 'specializations';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function psychologists(): BelongsToMany
    {
        return $this->belongsToMany(
            PsychologistProfile::class,
            'psychologist_specializations',
            'specialization_id',
            'psychologist_profile_id',
            'id',
            'user_id',
        );
    }
}
