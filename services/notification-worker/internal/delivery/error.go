package delivery

import "fmt"

type DeliveryError struct {
	Code      string
	Retryable bool
	Err       error
}

func (e *DeliveryError) Error() string {
	if e.Err == nil {
		return e.Code
	}

	return fmt.Sprintf("%s: %v", e.Code, e.Err)
}

func (e *DeliveryError) Unwrap() error {
	return e.Err
}

func permanentError(code string, err error) error {
	return &DeliveryError{
		Code:      code,
		Retryable: false,
		Err:       err,
	}
}

func retryableError(code string, err error) error {
	return &DeliveryError{
		Code:      code,
		Retryable: true,
		Err:       err,
	}
}
