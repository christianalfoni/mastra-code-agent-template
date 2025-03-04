# Use the official Qdrant image as a base
FROM qdrant/qdrant:latest

# Expose Qdrant’s default port
EXPOSE 6333

# (Optional) Create a volume for persistent data
VOLUME ["/qdrant/storage"]

# Default command to run Qdrant
CMD ["qdrant"]