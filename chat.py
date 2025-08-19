#
#   Muna
#   Copyright © 2025 NatML Inc. All Rights Reserved.
#

# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "huggingface_hub",
#     "llama-cpp-python",
#     "muna"
# ]
# ///

from huggingface_hub import hf_hub_download
from llama_cpp import Llama
from muna import compile, Sandbox
from muna.beta import Message
from typing import Iterator

# Load Geema 3 270M model from HuggingFace
model_path = hf_hub_download(
    "unsloth/gemma-3-270m-it-GGUF",
    "gemma-3-270m-it-F16.gguf"
)
model = Llama(model_path=model_path, verbose=False)

# Define the chat function
@compile(
    tag="@yusuf/gemma-3-270m", # REPLACE `@yusuf` with your Muna username
    description="Generate text with Google Gemma 3 270M.",
    sandbox=Sandbox()
        .apt_install("clang")
        .pip_install("huggingface_hub", "llama-cpp-python")
        .upload_file(model_path)
)
def chat(messages: list[Message]) -> Iterator[str]:
    for token in model.create_chat_completion(messages=messages, max_tokens=50_000, stream=True):
       yield token