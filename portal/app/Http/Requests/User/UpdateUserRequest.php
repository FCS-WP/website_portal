<?php

namespace App\Http\Requests\User;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => 'sometimes|string|max:255',
            'email' => ['sometimes', 'email', 'max:255', Rule::unique('users', 'email')->ignore($this->user)],
            'password' => 'nullable|string|min:8',
            'role' => 'sometimes|string|in:admin,dev,mkt',
            'is_active' => 'sometimes|boolean',
            'telegram_chat_id' => 'nullable|string|max:100',
        ];
    }
}
