<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Site2faSetting extends Model
{
    public $timestamps = false;

    protected $table = 'site_2fa_settings';

    protected $fillable = [
        'site_id',
        'enabled',
        'method',
        'wp_plugin_used',
        'enforce_for_admins',
        'enabled_by',
        'enabled_at',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'enforce_for_admins' => 'boolean',
        'enabled_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function enabledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enabled_by');
    }
}
