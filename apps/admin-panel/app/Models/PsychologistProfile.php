<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PsychologistProfile extends Model
{
    protected $table = 'psychologist_profiles';

    protected $primaryKey = 'user_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'languages_json' => 'array',
            'formats_json' => 'array',
            'rating_avg' => 'decimal:2',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'id');
    }

    public function moderatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'moderated_by_user_id', 'id');
    }

    public function specializations(): BelongsToMany
    {
        return $this->belongsToMany(
            Specialization::class,
            'psychologist_specializations',
            'psychologist_profile_id',
            'specialization_id',
            'user_id',
            'id',
        );
    }

    public function files(): HasMany
    {
        return $this->hasMany(File::class, 'psychologist_profile_id', 'user_id');
    }
}
