<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SiteCredential extends Model
{
    protected $fillable = [
        'site_id',
        'credential_type_id',
        'label',
        'notes',
        'created_by',
        'updated_by',
    ];

    protected $casts = [
        'notes' => 'encrypted',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function credentialType(): BelongsTo
    {
        return $this->belongsTo(CredentialType::class);
    }

    public function fields(): HasMany
    {
        return $this->hasMany(SiteCredentialField::class)->orderBy('sort_order');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    public function accessLogs(): HasMany
    {
        return $this->hasMany(VaultAccessLog::class, 'site_credential_id');
    }
}
