import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import html2canvas from "html2canvas";
import { supabase } from "./supabase";

type Memory = {
  id: number;
  title: string | null;
  date: string | null;
  note: string | null;
  image_url: string | null;
  created_at?: string | null;
};

const ANNIVERSARY_DEFAULT = "2021-05-24";
const YOUTUBE_VIDEO_ID = "5_ps6naLq6I";
const OUR_SONG_URL = `https://www.youtube.com/embed/${YOUTUBE_VIDEO_ID}?autoplay=1&controls=0&disablekb=1&fs=0&loop=1&modestbranding=1&playsinline=1&playlist=${YOUTUBE_VIDEO_ID}&rel=0`;

export default function App() {
  const [nightMode, setNightMode] = useState(true);
  const [showMusic, setShowMusic] = useState(false);
  const [musicEnabled, setMusicEnabled] = useState(true);

  const [user1Name, setUser1Name] = useState("Me");
  const [user2Name, setUser2Name] = useState("My Wife");
  const [specialDate, setSpecialDate] = useState(ANNIVERSARY_DEFAULT);
  const [caption, setCaption] = useState("A love worth keeping forever.");

  const [mainImagePreview, setMainImagePreview] = useState<string | null>(null);

  const [memoryTitle, setMemoryTitle] = useState("");
  const [memoryDate, setMemoryDate] = useState("");
  const [memoryNote, setMemoryNote] = useState("");
  const [memoryFile, setMemoryFile] = useState<File | null>(null);
  const [memoryPreview, setMemoryPreview] = useState<string | null>(null);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);

  const [loadingMemories, setLoadingMemories] = useState(true);
  const [savingMemory, setSavingMemory] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const previewRef = useRef<HTMLDivElement | null>(null);

  const formattedDate = useMemo(() => {
    if (!specialDate) return "Pick your special date";
    const date = new Date(specialDate);
    if (Number.isNaN(date.getTime())) return specialDate;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }, [specialDate]);

  const relationshipDays = useMemo(() => {
    if (!specialDate) return null;
    const start = new Date(specialDate);
    if (Number.isNaN(start.getTime())) return null;

    const today = new Date();
    const diff = today.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  }, [specialDate]);

  const isAnniversaryToday = useMemo(() => {
    if (!specialDate) return false;
    const anniversary = new Date(specialDate);
    const today = new Date();

    return (
      anniversary.getMonth() === today.getMonth() &&
      anniversary.getDate() === today.getDate()
    );
  }, [specialDate]);

  const floatingHearts = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: 6 + ((i * 6.1) % 88),
        delay: i * 0.45,
        duration: 8 + (i % 5),
        size: i % 3 === 0 ? 18 : i % 3 === 1 ? 14 : 12,
      })),
    []
  );

  const sortedMemories = useMemo(() => {
    return [...memories].sort((a, b) => {
      if (!a.date && !b.date) return (b.id ?? 0) - (a.id ?? 0);
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    });
  }, [memories]);

  useEffect(() => {
    loadMemories();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedMemory(null);
        setShowMusic(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (mainImagePreview) URL.revokeObjectURL(mainImagePreview);
      if (memoryPreview) URL.revokeObjectURL(memoryPreview);
    };
  }, [mainImagePreview, memoryPreview]);

  function formatReadableDate(value: string | null) {
    if (!value) return "No date added";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  async function loadMemories() {
    try {
      setLoadingMemories(true);
      setErrorMessage("");

      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

      if (error) throw error;

      setMemories((data as Memory[]) || []);
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to load memories.");
    } finally {
      setLoadingMemories(false);
    }
  }

  function handleMainImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (mainImagePreview) URL.revokeObjectURL(mainImagePreview);

    const url = URL.createObjectURL(file);
    setMainImagePreview(url);
  }

  function handleMemoryImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (memoryPreview) URL.revokeObjectURL(memoryPreview);

    const url = URL.createObjectURL(file);
    setMemoryFile(file);
    setMemoryPreview(url);
  }

  async function uploadMemoryImage(file: File) {
    const extension = file.name.split(".").pop() || "jpg";
    const filePath = `memories/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("memory-images")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("memory-images")
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async function addMemory() {
    if (!memoryTitle.trim() && !memoryNote.trim() && !memoryFile) {
      setErrorMessage("Add at least a title, note, or image.");
      return;
    }

    try {
      setSavingMemory(true);
      setErrorMessage("");

      let imageUrl: string | null = null;

      if (memoryFile) {
        imageUrl = await uploadMemoryImage(memoryFile);
      }

      const payload = {
        title: memoryTitle.trim() || null,
        date: memoryDate || null,
        note: memoryNote.trim() || null,
        image_url: imageUrl,
      };

      const { error } = await supabase.from("memories").insert(payload);
      if (error) throw error;

      setMemoryTitle("");
      setMemoryDate("");
      setMemoryNote("");
      setMemoryFile(null);

      if (memoryPreview) URL.revokeObjectURL(memoryPreview);
      setMemoryPreview(null);

      await loadMemories();
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to save memory.");
    } finally {
      setSavingMemory(false);
    }
  }

  async function removeMemory(id: number) {
    try {
      setErrorMessage("");

      const target = memories.find((memory) => memory.id === id);

      if (target?.image_url) {
        const marker = "/storage/v1/object/public/memory-images/";
        const index = target.image_url.indexOf(marker);

        if (index !== -1) {
          const storagePath = target.image_url.slice(index + marker.length);
          await supabase.storage.from("memory-images").remove([storagePath]);
        }
      }

      const { error } = await supabase.from("memories").delete().eq("id", id);
      if (error) throw error;

      setMemories((prev) => prev.filter((memory) => memory.id !== id));
      if (selectedMemory?.id === id) setSelectedMemory(null);
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to delete memory.");
    }
  }

  async function downloadPreview() {
    if (!previewRef.current) return;

    try {
      const canvas = await html2canvas(previewRef.current, {
        useCORS: true,
        backgroundColor: null,
        scale: 2,
      });

      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `${user1Name}-${user2Name}-love-card.png`;
      link.click();
    } catch (error) {
      console.error(error);
      setErrorMessage("Failed to download love card.");
    }
  }

  const pageBg = nightMode
    ? "radial-gradient(circle at top, rgba(27,19,42,1), rgba(17,24,39,1), rgba(8,12,24,1))"
    : "radial-gradient(circle at top, rgba(255,255,255,0.95), rgba(255,241,247,0.92), rgba(255,228,239,0.85), rgba(255,255,255,1))";

  return (
    <div
      style={{
        minHeight: "100vh",
        overflow: "hidden",
        background: pageBg,
        color: nightMode ? "#f1f5f9" : "#1e293b",
        position: "relative",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      {musicEnabled && (
        <div
          style={{
            position: "fixed",
            width: 1,
            height: 1,
            overflow: "hidden",
            opacity: 0,
            pointerEvents: "none",
            left: -9999,
            top: -9999,
          }}
        >
          <iframe
            title="Background music"
            src={OUR_SONG_URL}
            allow="autoplay; encrypted-media"
            style={{ width: 1, height: 1, border: "none" }}
          />
        </div>
      )}

      <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        {nightMode ? (
          <>
            <div
              style={{
                position: "absolute",
                left: "-10%",
                top: 0,
                width: 320,
                height: 320,
                borderRadius: "999px",
                background: "rgba(217,70,239,0.18)",
                filter: "blur(70px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: "-5%",
                top: 100,
                width: 380,
                height: 380,
                borderRadius: "999px",
                background: "rgba(99,102,241,0.18)",
                filter: "blur(80px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 100,
                left: "33%",
                width: 320,
                height: 320,
                borderRadius: "999px",
                background: "rgba(244,63,94,0.1)",
                filter: "blur(70px)",
              }}
            />
          </>
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                left: "-10%",
                top: 0,
                width: 280,
                height: 280,
                borderRadius: "999px",
                background: "rgba(251,113,133,0.2)",
                filter: "blur(60px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: "-5%",
                top: 100,
                width: 320,
                height: 320,
                borderRadius: "999px",
                background: "rgba(244,114,182,0.16)",
                filter: "blur(70px)",
              }}
            />
          </>
        )}

        {floatingHearts.map((heart) => (
          <motion.div
            key={heart.id}
            style={{
              position: "absolute",
              left: `${heart.left}%`,
              bottom: "-10%",
            }}
            animate={{
              y: [-10, -900],
              x: [0, heart.id % 2 === 0 ? 18 : -18],
              opacity: [0, 0.3, 0.5, 0],
            }}
            transition={{
              duration: heart.duration,
              delay: heart.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            <span
              style={{
                fontSize: heart.size,
                color: nightMode ? "rgba(253,164,175,0.38)" : "rgba(251,113,133,0.28)",
              }}
            >
              ❤
            </span>
          </motion.div>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          maxWidth: 1200,
          margin: "0 auto",
          padding: "24px 14px 48px",
        }}
      >
        <motion.section
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          style={{ marginBottom: 24 }}
        >
          <div
            style={{
              borderRadius: 32,
              border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.6)",
              background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.65)",
              boxShadow: nightMode
                ? "0 20px 60px rgba(76,29,149,0.25)"
                : "0 20px 60px rgba(251,113,133,0.18)",
              backdropFilter: "blur(18px)",
              padding: 20,
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 20,
                alignItems: "center",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    borderRadius: 999,
                    padding: "10px 16px",
                    background: "rgba(255,255,255,0.75)",
                    color: "#334155",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    fontSize: 14,
                    marginBottom: 16,
                  }}
                >
                  <span style={{ color: "#f43f5e" }}>✦</span>
                  <span>Our Love Story</span>
                </div>

                <h1
                  style={{
                    margin: 0,
                    fontSize: "clamp(34px, 8vw, 74px)",
                    lineHeight: 1.04,
                    fontWeight: 700,
                    color: nightMode ? "#fff" : "#0f172a",
                  }}
                >
                  A sleek little home for{" "}
                  <span
                    style={{
                      background: "linear-gradient(90deg, #f43f5e, #ec4899, #d946ef)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {user1Name} & {user2Name}
                  </span>
                </h1>

                <p
                  style={{
                    marginTop: 16,
                    maxWidth: 740,
                    fontSize: 18,
                    lineHeight: 1.7,
                    color: nightMode ? "#cbd5e1" : "#475569",
                  }}
                >
                  Upload your favorite photo, mark your special date, and build a soft memory lane
                  filled with the moments that matter most.
                </p>

                {isAnniversaryToday && (
                  <div
                    style={{
                      marginTop: 18,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 999,
                      padding: "10px 16px",
                      background: "rgba(244,63,94,0.16)",
                      border: "1px solid rgba(251,113,133,0.25)",
                      color: "#ffe4e6",
                      boxShadow: "0 0 28px rgba(244,63,94,0.22)",
                    }}
                  >
                    <span>❤</span>
                    <span>Today is your anniversary</span>
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                }}
              >
                <InfoCard
                  nightMode={nightMode}
                  title="Mode"
                  value={nightMode ? "Night" : "Day"}
                  right={
                    <button
                      onClick={() => setNightMode((prev) => !prev)}
                      style={toggleButtonStyle(nightMode)}
                    >
                      {nightMode ? "🌙" : "☀"}
                    </button>
                  }
                />
                <InfoCard nightMode={nightMode} title="Together since" value={formattedDate} />
                <InfoCard
                  nightMode={nightMode}
                  title="Days together"
                  value={relationshipDays !== null ? relationshipDays.toLocaleString() : "Not set yet"}
                />
                <InfoCard
                  nightMode={nightMode}
                  title="Music"
                  value={musicEnabled ? "Autoplay on" : "Autoplay off"}
                  right={
                    <button
                      onClick={() => setMusicEnabled((prev) => !prev)}
                      style={iconButtonStyle(nightMode)}
                    >
                      {musicEnabled ? "♫" : "🔇"}
                    </button>
                  }
                />
              </div>
            </div>
          </div>
        </motion.section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: 24,
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: 24 }}>
            <Panel nightMode={nightMode} title="Main page">
              <FieldLabel nightMode={nightMode}>Your name</FieldLabel>
              <InputBox
                nightMode={nightMode}
                value={user1Name}
                onChange={(e) => setUser1Name(e.target.value)}
                placeholder="Your name"
              />

              <FieldLabel nightMode={nightMode}>Her name</FieldLabel>
              <InputBox
                nightMode={nightMode}
                value={user2Name}
                onChange={(e) => setUser2Name(e.target.value)}
                placeholder="Her name"
              />

              <FieldLabel nightMode={nightMode}>Special date</FieldLabel>
              <InputBox
                nightMode={nightMode}
                type="date"
                value={specialDate}
                onChange={(e) => setSpecialDate(e.target.value)}
              />

              <FieldLabel nightMode={nightMode}>Romantic line</FieldLabel>
              <InputBox
                nightMode={nightMode}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="A short message"
              />

              <FieldLabel nightMode={nightMode}>Main photo</FieldLabel>
              <UploadLabel nightMode={nightMode} htmlFor="main-photo">
                Choose a photo
              </UploadLabel>
              <input
                id="main-photo"
                type="file"
                accept="image/*"
                onChange={handleMainImageUpload}
                style={{ display: "none" }}
              />

              <button
                onClick={downloadPreview}
                style={{
                  marginTop: 8,
                  width: "100%",
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 18,
                  padding: "14px 18px",
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#fff",
                  background: "linear-gradient(90deg, #6366f1, #8b5cf6, #d946ef)",
                  boxShadow: "0 14px 30px rgba(139,92,246,0.28)",
                }}
              >
                Download love card
              </button>
            </Panel>

            <Panel nightMode={nightMode} title="Add to memory lane">
              <FieldLabel nightMode={nightMode}>Memory title</FieldLabel>
              <InputBox
                nightMode={nightMode}
                value={memoryTitle}
                onChange={(e) => setMemoryTitle(e.target.value)}
                placeholder="Our first date"
              />

              <FieldLabel nightMode={nightMode}>Memory date</FieldLabel>
              <InputBox
                nightMode={nightMode}
                type="date"
                value={memoryDate}
                onChange={(e) => setMemoryDate(e.target.value)}
              />

              <FieldLabel nightMode={nightMode}>Short note</FieldLabel>
              <TextAreaBox
                nightMode={nightMode}
                value={memoryNote}
                onChange={(e) => setMemoryNote(e.target.value)}
                placeholder="Write why this moment matters"
              />

              <FieldLabel nightMode={nightMode}>Memory photo</FieldLabel>
              <UploadLabel nightMode={nightMode} htmlFor="memory-photo">
                Upload memory photo
              </UploadLabel>
              <input
                id="memory-photo"
                type="file"
                accept="image/*"
                onChange={handleMemoryImageUpload}
                style={{ display: "none" }}
              />

              {memoryPreview && (
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <img
                    src={memoryPreview}
                    alt="Preview"
                    style={{
                      width: "100%",
                      maxWidth: 220,
                      borderRadius: 16,
                      objectFit: "cover",
                      boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
                    }}
                  />
                </div>
              )}

              <button onClick={addMemory} disabled={savingMemory} style={primaryButtonStyle}>
                {savingMemory ? "Saving..." : "Add memory"}
              </button>

              {errorMessage && (
                <p style={{ color: "#fda4af", marginTop: 14, marginBottom: 0 }}>{errorMessage}</p>
              )}
            </Panel>
          </div>

          <div style={{ display: "grid", gap: 24 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: 0.08 }}
            >
              <div
                style={{
                  overflow: "hidden",
                  borderRadius: 32,
                  border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.55)",
                  background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
                  boxShadow: nightMode
                    ? "0 20px 60px rgba(76,29,149,0.22)"
                    : "0 20px 60px rgba(251,113,133,0.16)",
                  backdropFilter: "blur(16px)",
                }}
              >
                <div
                  ref={previewRef}
                  style={{
                    position: "relative",
                    minHeight: "clamp(420px, 65vw, 700px)",
                    background: nightMode
                      ? "linear-gradient(135deg, #020617, #312e81, #0f172a)"
                      : "linear-gradient(135deg, #ffe4e6, #fce7f3, #ffffff)",
                  }}
                >
                  {mainImagePreview ? (
                    <img
                      src={mainImagePreview}
                      alt="Main preview"
                      style={{
                        width: "100%",
                        height: "clamp(420px, 65vw, 700px)",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        minHeight: "clamp(420px, 65vw, 700px)",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 14,
                        color: nightMode ? "#94a3b8" : "#64748b",
                        padding: 20,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          width: 78,
                          height: 78,
                          borderRadius: "999px",
                          background: "rgba(255,255,255,0.8)",
                          display: "grid",
                          placeItems: "center",
                          fontSize: 28,
                          boxShadow: "0 10px 24px rgba(0,0,0,0.1)",
                        }}
                      >
                        🖼
                      </div>
                      <p style={{ margin: 0, fontSize: 18 }}>Your main photo will appear here</p>
                    </div>
                  )}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(to top, rgba(2,6,23,0.78), rgba(15,23,42,0.16), transparent)",
                    }}
                  />

                  <div style={{ position: "absolute", insetInline: 0, top: 0, padding: 20 }}>
                    {nightMode && (
                      <div style={{ position: "absolute", left: 20, right: 20, top: 18, height: 28 }}>
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: "50%",
                            height: 2,
                            transform: "translateY(-50%)",
                            background:
                              "linear-gradient(to right, rgba(253,230,138,0.2), rgba(254,243,199,0.9), rgba(253,230,138,0.2))",
                          }}
                        />
                        {[8, 22, 36, 50, 64, 78, 92].map((left, i) => (
                          <motion.div
                            key={i}
                            style={{
                              position: "absolute",
                              left: `${left}%`,
                              top: "50%",
                              width: 12,
                              height: 12,
                              borderRadius: "999px",
                              transform: "translate(-50%, -50%)",
                              background: "#fde68a",
                              boxShadow: "0 0 18px rgba(253,230,138,0.95)",
                            }}
                            animate={{ opacity: [0.45, 1, 0.45], scale: [0.9, 1.15, 0.9] }}
                            transition={{ duration: 2.4 + i * 0.15, repeat: Infinity, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    )}

                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        borderRadius: 999,
                        padding: "10px 16px",
                        color: "#fff",
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.1)",
                        backdropFilter: "blur(10px)",
                        fontSize: 14,
                      }}
                    >
                      <span>❤</span>
                      <span>Built for two</span>
                    </div>
                  </div>

                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 20 }}>
                    <motion.div
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.45, delay: 0.15 }}
                      style={{
                        maxWidth: 720,
                        borderRadius: 32,
                        padding: 22,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "rgba(255,255,255,0.1)",
                        color: "#fff",
                        backdropFilter: "blur(18px)",
                        boxShadow: "0 20px 50px rgba(0,0,0,0.24)",
                      }}
                    >
                      <p
                        style={{
                          marginTop: 0,
                          marginBottom: 10,
                          fontSize: 12,
                          textTransform: "uppercase",
                          letterSpacing: "0.35em",
                          color: "rgba(255,255,255,0.72)",
                        }}
                      >
                        Forever us
                      </p>

                      <h2
                        style={{
                          margin: 0,
                          fontSize: "clamp(30px, 7vw, 68px)",
                          lineHeight: 1.05,
                          fontWeight: 700,
                          wordBreak: "break-word",
                        }}
                      >
                        {user1Name} <span style={{ color: "#fda4af" }}>&</span> {user2Name}
                      </h2>

                      <p
                        style={{
                          marginTop: 16,
                          marginBottom: 0,
                          maxWidth: 620,
                          fontSize: "clamp(16px, 3vw, 18px)",
                          lineHeight: 1.7,
                          color: "rgba(255,255,255,0.92)",
                        }}
                      >
                        {caption}
                      </p>

                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 12,
                          marginTop: 22,
                        }}
                      >
                        <HeroPill>{formattedDate}</HeroPill>
                        <HeroPill>
                          {relationshipDays !== null
                            ? `${relationshipDays.toLocaleString()} days together`
                            : "Start your count"}
                        </HeroPill>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>

            <section>
              <div
                style={{
                  marginBottom: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "clamp(28px, 6vw, 36px)",
                      fontWeight: 700,
                      color: nightMode ? "#fff" : "#0f172a",
                    }}
                  >
                    Memory lane
                  </h3>
                  <p
                    style={{
                      marginTop: 8,
                      marginBottom: 0,
                      color: nightMode ? "#cbd5e1" : "#64748b",
                    }}
                  >
                    Moments hanging in time.
                  </p>
                </div>

                <div
                  style={{
                    borderRadius: 999,
                    padding: "10px 16px",
                    fontSize: 14,
                    color: nightMode ? "#cbd5e1" : "#64748b",
                    border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.6)",
                    background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.7)",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  {sortedMemories.length} {sortedMemories.length === 1 ? "memory" : "memories"}
                </div>
              </div>

              {loadingMemories ? (
                <EmptyPanel nightMode={nightMode}>Loading memories...</EmptyPanel>
              ) : sortedMemories.length === 0 ? (
                <EmptyPanel nightMode={nightMode}>
                  <div style={{ fontSize: 28 }}>❤</div>
                  <p style={{ fontSize: 22, fontWeight: 600, margin: "8px 0 0" }}>
                    Your memory rope is empty
                  </p>
                  <p style={{ maxWidth: 420, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
                    Add memories and watch them hang like photos on a rope.
                  </p>
                </EmptyPanel>
              ) : (
                <div style={{ position: "relative", padding: "34px 0 12px" }}>
                  {nightMode && (
                    <div style={{ position: "absolute", left: 0, right: 0, top: 4, zIndex: 10 }}>
                      <div style={{ position: "relative", height: 28 }}>
                        <div
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            top: "50%",
                            height: 2,
                            transform: "translateY(-50%)",
                            background:
                              "linear-gradient(to right, rgba(253,230,138,0.2), rgba(254,243,199,0.92), rgba(253,230,138,0.2))",
                          }}
                        />
                        {[4, 11, 18, 25, 32, 39, 46, 53, 60, 67, 74, 81, 88, 95].map((left, i) => (
                          <motion.div
                            key={i}
                            style={{
                              position: "absolute",
                              left: `${left}%`,
                              top: "50%",
                              width: 10,
                              height: 10,
                              borderRadius: "999px",
                              transform: "translate(-50%, -50%)",
                              background: "#fde68a",
                              boxShadow: "0 0 14px rgba(253,230,138,0.95)",
                            }}
                            animate={{ opacity: [0.35, 1, 0.35], scale: [0.9, 1.12, 0.9] }}
                            transition={{
                              duration: 2 + (i % 4) * 0.25,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: i * 0.08,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: 22,
                      height: 2,
                      background: nightMode
                        ? "linear-gradient(to right, rgba(253,230,138,0.3), rgba(254,243,199,0.92), rgba(253,230,138,0.3))"
                        : "linear-gradient(to right, #fda4af, #f9a8d4, #e879f9)",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "center",
                      gap: 24,
                    }}
                  >
                    {sortedMemories.map((memory, index) => (
                      <motion.div
                        key={memory.id}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          rotate: [
                            index % 2 === 0 ? -2 : 2,
                            index % 2 === 0 ? 2 : -2,
                            index % 2 === 0 ? -2 : 2,
                          ],
                        }}
                        transition={{
                          opacity: { delay: index * 0.08, duration: 0.4 },
                          y: { delay: index * 0.08, duration: 0.4 },
                          rotate: {
                            duration: 4.5 + index * 0.25,
                            repeat: Infinity,
                            ease: "easeInOut",
                          },
                        }}
                        style={{
                          transformOrigin: "top center",
                          position: "relative",
                          width: "min(220px, 90vw)",
                          paddingTop: 8,
                        }}
                      >
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: 0,
                            zIndex: 10,
                            width: 16,
                            height: 16,
                            transform: "translateX(-50%)",
                            borderRadius: "999px",
                            background: nightMode ? "#fde68a" : "#94a3b8",
                            boxShadow: nightMode
                              ? "0 0 12px rgba(253,230,138,0.8)"
                              : "0 4px 10px rgba(0,0,0,0.18)",
                          }}
                        />
                        <div
                          style={{
                            margin: "0 auto",
                            width: 2,
                            height: 42,
                            background: nightMode ? "rgba(254,243,199,0.6)" : "#cbd5e1",
                          }}
                        />

                        <div
                          style={{
                            position: "relative",
                            overflow: "hidden",
                            borderRadius: 4,
                            background: "#fffaf2",
                            padding: "12px 12px 18px",
                            boxShadow: nightMode
                              ? "0 22px 60px rgba(0,0,0,0.45)"
                              : "0 18px 40px rgba(15,23,42,0.16)",
                          }}
                        >
                          <button
                            onClick={() => setSelectedMemory(memory)}
                            style={{
                              display: "block",
                              width: "100%",
                              textAlign: "left",
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: "50%",
                                top: 12,
                                zIndex: 10,
                                width: 64,
                                height: 24,
                                transform: "translateX(-50%) rotate(-2deg)",
                                borderRadius: 3,
                                background: "rgba(255,255,255,0.62)",
                                boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
                                backdropFilter: "blur(3px)",
                              }}
                            />

                            {memory.image_url ? (
                              <div style={{ position: "relative" }}>
                                <img
                                  src={memory.image_url}
                                  alt={memory.title || "Memory"}
                                  style={{
                                    width: "100%",
                                    height: "min(210px, 60vw)",
                                    minHeight: 180,
                                    objectFit: "cover",
                                    borderRadius: 2,
                                    display: "block",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    inset: 0,
                                    display: "grid",
                                    placeItems: "center",
                                    background: "rgba(15,23,42,0.06)",
                                  }}
                                >
                                  <span
                                    style={{
                                      opacity: 0.92,
                                      borderRadius: 999,
                                      padding: "6px 12px",
                                      background: "rgba(255,255,255,0.84)",
                                      color: "#1e293b",
                                      fontSize: 12,
                                      fontWeight: 600,
                                      boxShadow: "0 8px 20px rgba(0,0,0,0.1)",
                                    }}
                                  >
                                    Open
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div
                                style={{
                                  height: "min(210px, 60vw)",
                                  minHeight: 180,
                                  borderRadius: 2,
                                  background: "#e5e7eb",
                                  display: "grid",
                                  placeItems: "center",
                                  color: "#64748b",
                                  fontSize: 15,
                                }}
                              >
                                No image
                              </div>
                            )}

                            <div style={{ paddingInline: 8, paddingTop: 16, textAlign: "center" }}>
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: 11,
                                  letterSpacing: "0.08em",
                                  color: "#64748b",
                                }}
                              >
                                {formatReadableDate(memory.date)}
                              </p>
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: 15,
                                  fontWeight: 700,
                                  color: "#0f172a",
                                  wordBreak: "break-word",
                                }}
                              >
                                {memory.title || "Untitled memory"}
                              </p>
                              <p
                                style={{
                                  margin: "8px 0 0",
                                  fontSize: 15,
                                  lineHeight: 1.6,
                                  color: "#475569",
                                  fontFamily:
                                    '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive',
                                  wordBreak: "break-word",
                                }}
                              >
                                {memory.note || "No note"}
                              </p>
                            </div>
                          </button>
                        </div>

                        <button
                          onClick={() => removeMemory(memory.id)}
                          style={{
                            position: "absolute",
                            right: -8,
                            top: -8,
                            borderRadius: "999px",
                            border: "none",
                            cursor: "pointer",
                            padding: "8px 10px",
                            background: nightMode ? "rgba(15,23,42,0.92)" : "#fff",
                            color: nightMode ? "#e2e8f0" : "#475569",
                            boxShadow: "0 10px 22px rgba(0,0,0,0.16)",
                          }}
                        >
                          ×
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedMemory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedMemory(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(2,6,23,0.8)",
              padding: 16,
              backdropFilter: "blur(10px)",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 1100,
                overflow: "hidden",
                borderRadius: 32,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(18px)",
                boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
              }}
            >
              <button
                onClick={() => setSelectedMemory(null)}
                style={{
                  position: "absolute",
                  right: 16,
                  top: 16,
                  zIndex: 20,
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.8)",
                  color: "#fff",
                  boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
                }}
              >
                ×
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                }}
              >
                <div style={{ minHeight: 320, background: "#020617" }}>
                  {selectedMemory.image_url ? (
                    <img
                      src={selectedMemory.image_url}
                      alt={selectedMemory.title || "Memory"}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: 320,
                        maxHeight: "70vh",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        minHeight: 320,
                        display: "grid",
                        placeItems: "center",
                        color: "#94a3b8",
                      }}
                    >
                      No image
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      textTransform: "uppercase",
                      letterSpacing: "0.32em",
                      color: "rgba(255,255,255,0.6)",
                    }}
                  >
                    Memory
                  </p>

                  <h3
                    style={{
                      marginTop: 14,
                      marginBottom: 0,
                      fontSize: "clamp(28px, 6vw, 40px)",
                      fontWeight: 700,
                      color: "#fff",
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedMemory.title || "Untitled memory"}
                  </h3>

                  <p
                    style={{
                      marginTop: 18,
                      marginBottom: 0,
                      display: "inline-flex",
                      width: "fit-content",
                      alignItems: "center",
                      gap: 8,
                      borderRadius: 999,
                      padding: "10px 16px",
                      background: "rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.88)",
                    }}
                  >
                    {formatReadableDate(selectedMemory.date)}
                  </p>

                  <p
                    style={{
                      marginTop: 24,
                      marginBottom: 0,
                      fontSize: "clamp(20px, 4vw, 24px)",
                      lineHeight: 1.8,
                      color: "rgba(255,255,255,0.92)",
                      fontFamily:
                        '"Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive',
                      wordBreak: "break-word",
                    }}
                  >
                    {selectedMemory.note || "No note"}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMusic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowMusic(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 50,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(2,6,23,0.75)",
              padding: 16,
              backdropFilter: "blur(10px)",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 860,
                overflow: "hidden",
                borderRadius: 32,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "#020617",
                boxShadow: "0 30px 80px rgba(0,0,0,0.35)",
              }}
            >
              <button
                onClick={() => setShowMusic(false)}
                style={{
                  position: "absolute",
                  right: 16,
                  top: 16,
                  zIndex: 20,
                  borderRadius: "999px",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 12px",
                  background: "rgba(15,23,42,0.84)",
                  color: "#fff",
                  boxShadow: "0 10px 22px rgba(0,0,0,0.18)",
                }}
              >
                ×
              </button>

              <div style={{ padding: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, color: "#fff", marginBottom: 18 }}>
                  <span style={{ color: "#fda4af", fontSize: 22 }}>♫</span>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>Our song</p>
                    <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700 }}>YouTube player</p>
                  </div>
                </div>

                <div
                  style={{
                    overflow: "hidden",
                    borderRadius: 24,
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  <div style={{ position: "relative", width: "100%", paddingTop: "56.25%" }}>
                    <iframe
                      title="Our song"
                      src={OUR_SONG_URL}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        border: "none",
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Panel({
  nightMode,
  title,
  children,
}: {
  nightMode: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 32,
        border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.6)",
        background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)",
        boxShadow: nightMode
          ? "0 20px 60px rgba(76,29,149,0.2)"
          : "0 20px 60px rgba(251,113,133,0.14)",
        backdropFilter: "blur(16px)",
        padding: 24,
      }}
    >
      <h3
        style={{
          marginTop: 0,
          marginBottom: 18,
          fontSize: "clamp(24px, 5vw, 28px)",
          fontWeight: 700,
          color: nightMode ? "#fff" : "#0f172a",
        }}
      >
        {title}
      </h3>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function FieldLabel({
  nightMode,
  children,
}: {
  nightMode: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      style={{
        fontSize: 14,
        fontWeight: 600,
        color: nightMode ? "#e2e8f0" : "#334155",
      }}
    >
      {children}
    </label>
  );
}

function InputBox(props: React.InputHTMLAttributes<HTMLInputElement> & { nightMode: boolean }) {
  const { nightMode, style, ...rest } = props;
  return (
    <input
      {...rest}
      style={{
        width: "100%",
        borderRadius: 18,
        border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.7)",
        background: nightMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)",
        color: nightMode ? "#fff" : "#0f172a",
        padding: "14px 16px",
        fontSize: 15,
        outline: "none",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function TextAreaBox(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { nightMode: boolean }
) {
  const { nightMode, style, ...rest } = props;
  return (
    <textarea
      {...rest}
      style={{
        width: "100%",
        minHeight: 110,
        resize: "vertical",
        borderRadius: 18,
        border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.7)",
        background: nightMode ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.9)",
        color: nightMode ? "#fff" : "#0f172a",
        padding: "14px 16px",
        fontSize: 15,
        outline: "none",
        boxSizing: "border-box",
        ...style,
      }}
    />
  );
}

function UploadLabel({
  nightMode,
  htmlFor,
  children,
}: {
  nightMode: boolean;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        cursor: "pointer",
        borderRadius: 24,
        border: nightMode
          ? "1px dashed rgba(217,70,239,0.35)"
          : "1px dashed rgba(251,113,133,0.5)",
        background: nightMode
          ? "linear-gradient(135deg, rgba(255,255,255,0.05), rgba(217,70,239,0.1))"
          : "linear-gradient(135deg, #fff1f2, #fdf2f8)",
        padding: "16px 18px",
        fontSize: 14,
        fontWeight: 600,
        color: nightMode ? "#e2e8f0" : "#334155",
        textAlign: "center",
      }}
    >
      {children}
    </label>
  );
}

function InfoCard({
  nightMode,
  title,
  value,
  right,
}: {
  nightMode: boolean;
  title: string;
  value: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 28,
        border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.6)",
        background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.75)",
        backdropFilter: "blur(12px)",
        padding: 20,
        boxShadow: nightMode
          ? "0 10px 24px rgba(15,23,42,0.16)"
          : "0 10px 24px rgba(251,113,133,0.08)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: nightMode ? "#94a3b8" : "#64748b",
            }}
          >
            {title}
          </p>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: "clamp(20px, 4vw, 24px)",
              fontWeight: 700,
              color: nightMode ? "#fff" : "#0f172a",
              wordBreak: "break-word",
            }}
          >
            {value}
          </p>
        </div>
        {right}
      </div>
    </div>
  );
}

function HeroPill({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 999,
        padding: "10px 16px",
        background: "rgba(255,255,255,0.15)",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        backdropFilter: "blur(10px)",
      }}
    >
      {children}
    </div>
  );
}

function EmptyPanel({
  nightMode,
  children,
}: {
  nightMode: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: 220,
        borderRadius: 32,
        border: nightMode ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(255,255,255,0.6)",
        background: nightMode ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.72)",
        boxShadow: nightMode
          ? "0 20px 60px rgba(76,29,149,0.18)"
          : "0 20px 60px rgba(251,113,133,0.12)",
        backdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 4,
        color: nightMode ? "#cbd5e1" : "#64748b",
        padding: 24,
      }}
    >
      {children}
    </div>
  );
}

function toggleButtonStyle(nightMode: boolean): React.CSSProperties {
  return {
    border: "none",
    cursor: "pointer",
    borderRadius: "999px",
    width: 44,
    height: 44,
    fontSize: 18,
    background: nightMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
    color: nightMode ? "#fde68a" : "#334155",
    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
    flexShrink: 0,
  };
}

function iconButtonStyle(nightMode: boolean): React.CSSProperties {
  return {
    border: "none",
    cursor: "pointer",
    borderRadius: "999px",
    width: 44,
    height: 44,
    fontSize: 18,
    background: nightMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
    color: nightMode ? "#fda4af" : "#e11d48",
    boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
    flexShrink: 0,
  };
}

const primaryButtonStyle: React.CSSProperties = {
  marginTop: 8,
  width: "100%",
  border: "none",
  cursor: "pointer",
  borderRadius: 18,
  padding: "14px 18px",
  fontSize: 15,
  fontWeight: 700,
  color: "#fff",
  background: "linear-gradient(90deg, #f43f5e, #ec4899, #d946ef)",
  boxShadow: "0 14px 30px rgba(236,72,153,0.28)",
};