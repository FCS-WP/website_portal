<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderSpikeAlert extends Model
{
    protected $fillable = [
        'site_id',
        'alert_type',
        'order_count',
        'threshold',
        'window_minutes',
        'telegram_sent',
        'telegram_sent_at',
    ];

    protected $casts = [
        'telegram_sent' => 'boolean',
        'telegram_sent_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
