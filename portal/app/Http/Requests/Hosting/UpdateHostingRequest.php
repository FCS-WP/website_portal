<?php

namespace App\Http\Requests\Hosting;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateHostingRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'string', 'max:255', Rule::unique('hostings', 'name')->ignore($this->hosting)],
            'provider' => 'sometimes|string|in:cloudways,cpanel,runcloud,vultr,digitalocean,gridpane,spinupwp,forge,ploi,other',
            'note' => 'nullable|string',
            'ip_address' => 'nullable|string|max:45',
            'username' => 'nullable|string|max:255',
            'password' => 'nullable|string|max:500',
            'panel_url' => 'nullable|url|max:500',
        ];
    }
}
