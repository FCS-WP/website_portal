<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Hosting extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'name',
        'provider',
        'note',
        'ip_address',
        'username',
        'password_encrypted',
        'panel_url',
        'created_by',
    ];

    protected $hidden = ['password_encrypted'];

    protected $appends = ['has_credentials'];

    public function getHasCredentialsAttribute(): bool
    {
        return !empty($this->attributes['password_encrypted']);
    }

    public function setPasswordEncryptedAttribute($value)
    {
        $this->attributes['password_encrypted'] = $value ? encrypt($value) : null;
    }

    public function getPasswordEncryptedAttribute($value)
    {
        if ($value === null) return null;
        try {
            return decrypt($value);
        } catch (\Exception $e) {
            return null;
        }
    }

    public function sites(): HasMany
    {
        return $this->hasMany(Site::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
