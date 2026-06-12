package service

import (
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

// UploadURLResponse is returned to the client so it can upload directly to Cloudinary.
type UploadURLResponse struct {
	UploadURL string `json:"upload_url"`
	Signature string `json:"signature"`
	Timestamp int64  `json:"timestamp"`
	APIKey    string `json:"api_key"`
	CloudName string `json:"cloud_name"`
	Folder    string `json:"folder"`
}

type UploadService struct {
	cloudinaryURL string
}

func NewUploadService(cloudinaryURL string) *UploadService {
	return &UploadService{cloudinaryURL: cloudinaryURL}
}

// GenerateUploadURL creates a signed upload URL for direct browser-to-Cloudinary upload.
// The signature expires in 60 seconds.
func (s *UploadService) GenerateUploadURL(taskID string) (*UploadURLResponse, error) {
	if s.cloudinaryURL == "" {
		return nil, fmt.Errorf("cloudinary not configured")
	}

	u, err := url.Parse(s.cloudinaryURL)
	if err != nil {
		return nil, fmt.Errorf("parse cloudinary URL: %w", err)
	}

	apiKey := u.User.Username()
	apiSecret, _ := u.User.Password()
	cloudName := u.Host

	timestamp := time.Now().Unix()
	folder := fmt.Sprintf("tasks/%s", taskID)

	params := map[string]string{
		"folder":    folder,
		"timestamp": fmt.Sprintf("%d", timestamp),
	}

	signature := cloudinarySignature(params, apiSecret)

	return &UploadURLResponse{
		UploadURL: fmt.Sprintf("https://api.cloudinary.com/v1_1/%s/auto/upload", cloudName),
		Signature: signature,
		Timestamp: timestamp,
		APIKey:    apiKey,
		CloudName: cloudName,
		Folder:    folder,
	}, nil
}

// cloudinarySignature produces a SHA-1 HMAC of sorted param pairs + api_secret.
func cloudinarySignature(params map[string]string, apiSecret string) string {
	keys := make([]string, 0, len(params))
	for k := range params {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(params))
	for _, k := range keys {
		parts = append(parts, k+"="+params[k])
	}
	payload := strings.Join(parts, "&") + apiSecret

	h := sha1.New()
	h.Write([]byte(payload))
	return hex.EncodeToString(h.Sum(nil))
}