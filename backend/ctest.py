import os
import requests
import datetime
from openai import OpenAI

# Fallback for environments where openai.error may not resolve
try:
    from openai.error import AuthenticationError, APIError
except Exception:
    AuthenticationError = Exception
    APIError = Exception

def check_openai_key(api_key):
    client = OpenAI(api_key=api_key)
    try:
        models = client.models.list()
        print("✅ API key is valid.")
        print("Available models:")
        for model in models.data:
            print(f"- {model.id}")
        
        premium = [m.id for m in models.data if any(x in m.id for x in ["gpt-4", "gpt-5", "dall-e-3", "sora", "pro"])]
        if premium:
            print("\n🔒 Premium model access detected:")
            for m in premium:
                print(f"- {m}")
        else:
            print("\n⚠️ No premium model access detected.")
    except AuthenticationError:
        print("❌ Invalid API key.")
    except APIError as e:
        print(f"⚠️ API error: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected error: {e}")

def check_openai_usage(api_key):
    headers = {
        "Authorization": f"Bearer {api_key}"
    }

    # Subscription info
    sub_url = "https://api.openai.com/v1/dashboard/billing/subscription"
    sub_resp = requests.get(sub_url, headers=headers)
    if sub_resp.status_code != 200:
        print("❌ Failed to fetch subscription info.")
        print(sub_resp.json())
        return

    sub_data = sub_resp.json()
    hard_limit_usd = sub_data.get("hard_limit_usd", "N/A")
    access_until = sub_data.get("access_until", "N/A")
    print(f"\n💳 Subscription limit: ${hard_limit_usd}")
    print(f"📅 Access valid until: {datetime.datetime.fromtimestamp(access_until).date()}")

    # Usage info
    today = datetime.datetime.now()
    start_date = today.replace(day=1).strftime("%Y-%m-%d")
    end_date = today.strftime("%Y-%m-%d")
    usage_url = f"https://api.openai.com/v1/dashboard/billing/usage?start_date={start_date}&end_date={end_date}"
    usage_resp = requests.get(usage_url, headers=headers)
    if usage_resp.status_code != 200:
        print("❌ Failed to fetch usage info.")
        print(usage_resp.json())
        return

    usage_data = usage_resp.json()
    total_usage = usage_data.get("total_usage", 0) / 100.0
    print(f"📊 Usage this month: ${total_usage:.2f}")

    remaining = float(hard_limit_usd) - total_usage if hard_limit_usd != "N/A" else "N/A"
    print(f"🧮 Remaining quota: ${remaining:.2f}" if isinstance(remaining, float) else "🧮 Remaining quota: N/A")

if __name__ == "__main__":
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        print("Set OPENAI_API_KEY environment variable (do not hardcode keys).")
    else:
        check_openai_key(key)
        check_openai_usage(key)