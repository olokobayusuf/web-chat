"use client"

import clsx from "clsx"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowUp } from "lucide-react"
import { Muna } from "muna"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const PREDICTOR_TAG = "@anon/gemma3-270m"; // Replace with your Muna tag

export default function Chat() {
  const [started, setStarted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const muna = useMemo(() => new Muna({ url: "/api" }), []);
  // Preload predictor
  useEffect(() => {
    setIsModelReady(false);
    const preload = muna.predictions.create({
      tag: PREDICTOR_TAG,
      inputs: { }
    });
    toast.promise(preload, {
      loading: "Loading model...",
      success: () => "Loaded model",
      error: "Failed to load model."
    });
    preload
      .then(() => setIsModelReady(true))
      .catch(() => setIsModelReady(false));
  }, [muna]);
  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isThinking])

  const handleSend = useCallback(async () => {
    if (!isModelReady || isStreaming)
      return;
    const trimmed = prompt.trim()
    if (!trimmed)
      return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
    }
    setMessages(prev => [...prev, userMessage])
    setPrompt("")
    if (!started) {
      setStarted(true);
      await new Promise(r => setTimeout(r, 300)); // Wait for composer animation
    }
    // Placeholder assistant message to stream into
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    setIsThinking(true);
    setIsStreaming(true);
    try {
      // Create a streaming completion
      const stream = await muna.beta.chat.completions.create({
        model: PREDICTOR_TAG,
        messages: [
          { role: "user", content: trimmed }
        ],
        stream: true
      });
      let receivedFirstToken = false;
      // Consume async iterator of chunks
      for await (const chunk of stream) {
        const token = chunk?.choices?.[0]?.delta?.content ?? "";
        if (!token)
          continue;
        if (!receivedFirstToken) {
          setIsThinking(false);
          receivedFirstToken = true;
        }
        setMessages(prev => {
          const next = [...prev];
          const idx = next.findIndex(m => m.id === assistantId);
          if (idx !== -1)
            next[idx] = { ...next[idx], content: next[idx].content + token };
          else
            next.push({ id: chunk.id, role: "assistant", content: token });
          return next;
        });
        await new Promise(r => setTimeout(r, 1));
      }
    } catch (error: any) {
      setIsThinking(false);
      toast.error(error?.message ?? "Chat failed");
      console.log(error);
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
    }
  }, [prompt, started, muna, isModelReady, isStreaming]);

  const sendDisabled = !isModelReady || isStreaming;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (sendDisabled)
        return;
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={clsx("dark min-h-screen w-full bg-zinc-900 text-zinc-100")}> 
      <motion.div layout className="mx-auto flex h-screen w-full max-w-3xl flex-col px-4">
        {/* Main region keeps a stable height to avoid layout jumps */}
        <div className="relative flex-1 min-h-0">
          {/* Centered prompt for initial state */}
          <AnimatePresence initial={false}>
            {!started && (
              <motion.div
                key="center-compose"
                className="absolute inset-0 flex flex-col items-center justify-center px-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <Link href="https://muna.ai" target="_blank" rel="noopener noreferrer">
                  <img
                    src="/logo_1024.png"
                    alt="Logo"
                    className="mx-auto mb-6 w-20 h-auto"
                  />
                </Link>
                <motion.div
                  layoutId="composer"
                  className="w-full"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                >
                  <Composer
                    value={prompt}
                    onChange={setPrompt}
                    onSend={handleSend}
                    onKeyDown={onKeyDown}
                    disabled={sendDisabled}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat area once started */}
          {started && (
            <motion.div layout className="flex h-full min-h-0 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 pt-12">
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
                  {messages.map((m) => (
                    <ChatBubble key={m.id} role={m.role} content={m.content} />
                  ))}
                  {isThinking && <AssistantTyping />}
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Footer composer (target of the shared layoutId) */}
        {started && (
          <motion.div layout className="mt-3 mb-6">
            <motion.div
              layoutId="composer"
              className="w-full"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            >
              <Composer
                value={prompt}
                onChange={setPrompt}
                onSend={handleSend}
                onKeyDown={onKeyDown}
                variant="footer"
                disabled={sendDisabled}
              />
            </motion.div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

function Composer({
  value,
  onChange,
  onSend,
  onKeyDown,
  disabled,
  variant = "center",
}: {
  value: string
  onChange: (v: string) => void
  onSend: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  disabled?: boolean
  variant?: "center" | "footer"
}) {
  return (
    <div className={clsx("relative mx-auto w-full max-w-2xl", variant === "footer" ? "" : "")}> 
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Ask anything..."
        className={clsx(
          "w-full rounded-full bg-zinc-800/80 px-5 pr-16 text-base text-zinc-100 placeholder:text-zinc-400",
          "h-14 py-0",
          "border border-zinc-700/50 focus:outline-none"
        )}
      />
      <button
        onClick={onSend}
        aria-label="Send"
        className={clsx(
          "absolute right-1.5 top-1/2 grid -translate-y-1/2 place-items-center rounded-full bg-zinc-100 text-black w-10 h-auto",
          "hover:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-300",
          disabled && "cursor-not-allowed bg-zinc-500 hover:bg-zinc-500"
        )}
        disabled={disabled}
        aria-disabled={disabled}
      >
        <ArrowUp className="w-6 h-auto m-2" />
      </button>
    </div>
  )
}

function ChatBubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user"
  return (
    <div className={clsx("flex w-full", isUser ? "justify-end" : "justify-start")}> 
      <div
        className={clsx(
          "max-w-[80%] px-4 py-2 text-base leading-relaxed",
          isUser
            ? "rounded-full bg-zinc-700/70 text-zinc-100"
            : "text-zinc-300"
        )}
      >
        {content}
      </div>
    </div>
  )
}

function AssistantTyping() {
  return (
    <div className="flex w-full justify-start">
      <div className="flex items-center gap-2 rounded-2xl border border-zinc-700/50 bg-zinc-800/50 px-3 py-2 text-zinc-300">
        <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:0ms]" />
        <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:150ms]" />
        <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-zinc-400 [animation-delay:300ms]" />
      </div>
    </div>
  )
}