<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteCredentialField extends Model
{
    protected $fillable = [
        'site_credential_id',
        'field_key',
        'field_label',
        'field_value',
        'is_sensitive',
        'sort_order',
    ];

    protected $casts = [
        'is_sensitive' => 'boolean',
    ];

    public function credential(): BelongsTo
    {
        return $this->belongsTo(SiteCredential::class, 'site_credential_id');
    }
}
