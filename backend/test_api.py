import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API key from environment
api_key = os.environ.get('GEMINI_API_KEY')
print(f"API Key loaded: {api_key[:20]}...")

# Test the API key with a simple list models request
list_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

try:
    print("Testing new API key...")
    response = requests.get(list_url, timeout=10)
    print(f"List models response: {response.status_code}")
    
    if response.status_code == 200:
        models = response.json()
        available_models = []
        print(f"✅ API key is valid! Available models: {len(models.get('models', []))}")
        
        for model in models.get('models', []):
            name = model.get('name', '').replace('models/', '')
            methods = model.get('supportedGenerationMethods', [])
            if 'generateContent' in methods:
                available_models.append(name)
                
        print(f"📝 Models supporting generateContent: {available_models[:10]}")
        
        # Test with different models - try 1.5-flash first (usually more quota available)
        test_models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-1.0-pro']
        test_models = [m for m in test_models if m in available_models]
        
        if test_models:
            for test_model in test_models[:2]:  # Try first 2
                print(f"\n🧪 Testing content generation with: {test_model}")
                
                test_url = f"https://generativelanguage.googleapis.com/v1beta/models/{test_model}:generateContent?key={api_key}"
                test_payload = {
                    "contents": [{"role": "user", "parts": [{"text": "Hi"}]}],
                    "generationConfig": {"temperature": 0.7, "maxOutputTokens": 50}
                }
                
                test_response = requests.post(test_url, json=test_payload, timeout=15)
                print(f"Content generation response: {test_response.status_code}")
                
                if test_response.status_code == 200:
                    test_data = test_response.json()
                    answer = test_data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
                    print(f"✅ Content generation successful with {test_model}!")
                    print(f"🤖 AI Response: {answer[:100]}...")
                    break  # Found working model
                elif test_response.status_code == 429:
                    print(f"⏳ {test_model}: Quota exceeded, trying next model...")
                else:
                    print(f"❌ {test_model} failed: {test_response.text[:200]}...")
        else:
            print("❌ No suitable models found")
    else:
        print(f"❌ API key validation failed: {response.text}")

except Exception as e:
    print(f"❌ Exception during testing: {e}")

print("\n" + "="*50)
print("API key testing complete!")