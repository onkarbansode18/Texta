"""
Deprecated local embedding script.

This project now uses the backend's configured embedding provider
instead of generating SentenceTransformer embeddings on the laptop.
That keeps CPU, RAM, and local storage usage low on this machine.
"""


def main():
    print("Local embedding generation is disabled for this project.")
    print("Use the backend upload/query flow with remote embeddings instead.")
    print("")
    print("Current recommended setup:")
    print("- backend/.env -> EMBEDDING_PROVIDER=gemini")
    print("- backend/.env -> EMBED_ON_UPLOAD=true")
    print("- backend/.env -> ALLOW_LOCAL_JSON_FALLBACK=false")
    print("")
    print("Next step:")
    print("1. Start the backend")
    print("2. Upload PDFs through the app")
    print("3. Let the backend create embeddings remotely")


if __name__ == "__main__":
    main()