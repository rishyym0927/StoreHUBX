package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port           string
	MongoURI       string
	JWTSecret      string
	GithubClientID string
	GithubSecret   string
	GithubRedirect string
}

var AppConfig *Config

// LoadConfig loads .env vars into AppConfig
func LoadConfig() {
	_ = godotenv.Load() // loads from .env if present

	AppConfig = &Config{
		Port:           getEnv("PORT", "8080"),
		MongoURI:       getEnv("MONGO_URI", ""),
		JWTSecret:      getEnv("JWT_SECRET", ""),
		GithubClientID: getEnv("GITHUB_CLIENT_ID", ""),
		GithubSecret:   getEnv("GITHUB_CLIENT_SECRET", ""),
		GithubRedirect: getEnv("GITHUB_REDIRECT_URL", ""),
	}
	if AppConfig.MongoURI == "" {
		log.Fatal("MONGO_URI not set")
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	return fallback
}
