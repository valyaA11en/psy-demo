<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class File extends Model
{
    use UsesUuidPrimaryKey;

    protected $table = 'files';

    public $timestamps = false;

    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'size_bytes' => 'integer',
            'created_at' => 'datetime',
            'uploaded_at' => 'datetime',
            'deleted_at' => 'datetime',
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id', 'id');
    }

    public function psychologistProfile(): BelongsTo
    {
        return $this->belongsTo(PsychologistProfile::class, 'psychologist_profile_id', 'user_id');
    }
}
