<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteSmtpSetting extends Model
{
    protected $fillable = [
        'site_id',
        'host',
        'port',
        'username',
        'password_encrypted',
        'encryption',
        'from_email',
        'from_name',
        'enabled',
        'last_pushed_at',
        'updated_by',
    ];

    protected $hidden = [
        'password_encrypted',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'port' => 'integer',
        'last_pushed_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }

    public function updatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
