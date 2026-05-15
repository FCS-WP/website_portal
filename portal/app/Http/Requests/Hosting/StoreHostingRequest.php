<?php

namespace App\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;

class StoreHostingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Authorization handled by middleware
    }

    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255|unique:hostings,name',
            'provider' => 'required|string|in:cloudways,cpanel,runcloud,vultr,digitalocean,other',
            'note' => 'nullable|string',
        ];
    }
}
