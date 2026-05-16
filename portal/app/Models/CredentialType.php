<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CredentialType extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'name',
        'slug',
        'icon',
        'sort_order',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public static function boot(): void
    {
        parent::boot();

        static::creating(function ($model) {
            $model->created_at = $model->freshTimestamp();
        });
    }

    public function credentials(): HasMany
    {
        return $this->hasMany(SiteCredential::class, 'credential_type_id');
    }
}
