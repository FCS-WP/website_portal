<?php

namespace App\Http\Requests\Plugin;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePluginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'slug' => ['sometimes', 'string', 'max:255', Rule::unique('plugins', 'slug')->ignore($this->route('plugin')), 'regex:/^[a-z0-9]+(-[a-z0-9]+)*$/'],
            'description' => 'nullable|string',
            'author' => 'nullable|string|max:255',
            'is_active' => 'sometimes|boolean',
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex' => 'The slug must be lowercase letters, numbers, and hyphens only.',
        ];
    }
}
