package validator

import (
	"fmt"
	"net/mail"
	"strings"
)

// Errors collects per-field validation errors.
type Errors map[string]string

// Add records a validation failure for a field.
func (e Errors) Add(field, message string) {
	e[field] = message
}

// OK returns true when no errors have been recorded.
func (e Errors) OK() bool {
	return len(e) == 0
}

// Error implements the error interface so Errors can be returned as an error.
func (e Errors) Error() string {
	parts := make([]string, 0, len(e))
	for k, v := range e {
		parts = append(parts, fmt.Sprintf("%s: %s", k, v))
	}
	return strings.Join(parts, "; ")
}

// Required fails when value is empty after trimming.
func Required(errs Errors, field, value string) {
	if strings.TrimSpace(value) == "" {
		errs.Add(field, "is required")
	}
}

// MinLen fails when the string is shorter than min characters.
func MinLen(errs Errors, field, value string, min int) {
	if len(strings.TrimSpace(value)) < min {
		errs.Add(field, fmt.Sprintf("must be at least %d characters", min))
	}
}

// MaxLen fails when the string exceeds max characters.
func MaxLen(errs Errors, field, value string, max int) {
	if len(value) > max {
		errs.Add(field, fmt.Sprintf("must be at most %d characters", max))
	}
}

// Email fails when value is not a valid email address.
func Email(errs Errors, field, value string) {
	if _, err := mail.ParseAddress(value); err != nil {
		errs.Add(field, "must be a valid email address")
	}
}

// OneOf fails when value is not in the allowed list.
func OneOf(errs Errors, field, value string, allowed ...string) {
	for _, a := range allowed {
		if value == a {
			return
		}
	}
	errs.Add(field, fmt.Sprintf("must be one of: %s", strings.Join(allowed, ", ")))
}

// OneOfPtr is like OneOf but skips validation when the pointer is nil (field not provided).
func OneOfPtr(errs Errors, field string, value *string, allowed ...string) {
	if value == nil {
		return
	}
	OneOf(errs, field, *value, allowed...)
}