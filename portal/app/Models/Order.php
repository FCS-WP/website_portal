<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Order extends Model
{
    use HasFactory;

    protected $fillable = [
        'site_id',
        'woo_order_id',
        'order_number',
        'status',
        'total',
        'currency',
        'customer_name',
        'customer_email',
        'customer_phone',
        'billing_address',
        'payment_method',
        'payment_method_title',
        'line_items',
        'items_count',
        'latest_note',
        'order_date',
        'synced_at',
    ];

    protected $casts = [
        'total' => 'decimal:2',
        'line_items' => 'array',
        'items_count' => 'integer',
        'order_date' => 'datetime',
        'synced_at' => 'datetime',
    ];

    public function site(): BelongsTo
    {
        return $this->belongsTo(Site::class);
    }
}
