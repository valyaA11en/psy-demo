<?php

namespace App\Models;

use App\Models\Concerns\UsesUuidPrimaryKey;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class User extends Model
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory;

    use UsesUuidPrimaryKey;

    protected $table = 'users';

    protected $guarded = [];

    protected $hidden = [
        'password_hash',
        'phone_hash',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at' => 'datetime',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
            'is_2fa_enabled' => 'boolean',
        ];
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles', 'user_id', 'role_id');
    }

    public function clientProfile(): HasOne
    {
        return $this->hasOne(ClientProfile::class, 'user_id', 'id');
    }

    public function psychologistProfile(): HasOne
    {
        return $this->hasOne(PsychologistProfile::class, 'user_id', 'id');
    }

    public function scopeWithAdminRelations(Builder $query): Builder
    {
        return $query->with(['roles', 'clientProfile', 'psychologistProfile']);
    }

    public function isAdmin(): bool
    {
        return $this->hasRole(['admin', 'superadmin']);
    }

    public function hasRole(array|string $roles): bool
    {
        $target = (array) $roles;
        $codes = $this->roles instanceof Collection
            ? $this->roles->pluck('code')->all()
            : $this->roles()->pluck('code')->all();

        foreach ($target as $role) {
            if (in_array($role, $codes, true)) {
                return true;
            }
        }

        return false;
    }

    public function displayName(): string
    {
        if ($this->psychologistProfile) {
            return trim(sprintf(
                '%s %s',
                $this->psychologistProfile->first_name,
                $this->psychologistProfile->last_name,
            ));
        }

        if ($this->clientProfile?->display_name) {
            return $this->clientProfile->display_name;
        }

        return $this->email;
    }
}
