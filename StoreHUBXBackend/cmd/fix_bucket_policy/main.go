package main

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strings"

	"github.com/joho/godotenv"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

func main() {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		fmt.Println("No .env file found, using environment variables")
	}

	// Parse environment variables
	endpoint := os.Getenv("S3_ENDPOINT")
	accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
	secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")
	bucket := os.Getenv("S3_BUCKET")

	// Validate required environment variables
	if endpoint == "" || accessKey == "" || secretKey == "" || bucket == "" {
		log.Fatal("Missing required environment variables")
	}

	// Parse endpoint to extract host and determine if secure
	secure := false
	if strings.Contains(endpoint, "://") {
		u, err := url.Parse(endpoint)
		if err != nil {
			log.Fatalf("Invalid S3_ENDPOINT: %v", err)
		}
		secure = (u.Scheme == "https")
		endpoint = u.Host
	}

	// Initialize MinIO client
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: secure,
	})
	if err != nil {
		log.Fatalf("Failed to initialize MinIO client: %v", err)
	}

	// Check if bucket exists
	exists, err := client.BucketExists(context.Background(), bucket)
	if err != nil {
		log.Fatalf("Error checking bucket existence: %v", err)
	}
	if !exists {
		log.Fatalf("Bucket %s does not exist", bucket)
	}

	fmt.Printf("Setting public read policy for bucket %s\n", bucket)

	// Set bucket policy for public read access
	policy := fmt.Sprintf(`{
		"Version": "2012-10-17",
		"Statement": [
			{
				"Effect": "Allow",
				"Principal": "*",
				"Action": ["s3:GetObject", "s3:ListBucket"],
				"Resource": ["arn:aws:s3:::%s/*", "arn:aws:s3:::%s"]
			}
		]
	}`, bucket, bucket)

	// Set the policy
	err = client.SetBucketPolicy(context.Background(), bucket, policy)
	if err != nil {
		log.Fatalf("Error setting bucket policy: %v", err)
	}

	fmt.Printf("Successfully set public read policy for bucket %s\n", bucket)
}
