package utils

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"os"
)

// No global key variable needed, we'll get it from env each time

func Encrypt(text string) string {
	key := []byte(os.Getenv("TOKEN_ENC_KEY"))
	if len(key) != 32 {
		fmt.Println("❌ TOKEN_ENC_KEY must be 32 bytes")
		return ""
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		fmt.Println("❌ aes.NewCipher:", err)
		return ""
	}
	plaintext := []byte(text)
	ciphertext := make([]byte, aes.BlockSize+len(plaintext))
	iv := ciphertext[:aes.BlockSize]
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		fmt.Println("❌ rand:", err)
		return ""
	}
	cipher.NewCFBEncrypter(block, iv).XORKeyStream(ciphertext[aes.BlockSize:], plaintext)
	return base64.URLEncoding.EncodeToString(ciphertext)
}

func Decrypt(cryptoText string) string {
	key := []byte(os.Getenv("TOKEN_ENC_KEY"))
	if len(key) != 32 {
		fmt.Println("❌ TOKEN_ENC_KEY must be 32 bytes for decryption")
		return ""
	}

	ciphertext, _ := base64.URLEncoding.DecodeString(cryptoText)
	block, err := aes.NewCipher(key)
	if err != nil {
		fmt.Println("❌ aes.NewCipher for decryption:", err)
		return ""
	}
	if len(ciphertext) < aes.BlockSize {
		return ""
	}
	iv := ciphertext[:aes.BlockSize]
	ciphertext = ciphertext[aes.BlockSize:]
	stream := cipher.NewCFBDecrypter(block, iv)
	stream.XORKeyStream(ciphertext, ciphertext)
	return string(ciphertext)
}
