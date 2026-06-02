"use client";
import { useState, useEffect, useMemo } from "react";

// --- Types ---
type BaseSchedule = {
  id: string;
  title: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
};

type FixedSchedule = {
  id: string;
  title: string;
  type: "once" | "weekly";
  date?: string; // YYYY-MM-DD
  daysOfWeek?: number[]; // 0-6
  startTime: string;
  endTime: string;
};

type Task = {
  id: string;
  title: string;
  durationMinutes: number;
  deadlineDate: string; // YYYY-MM-DD
};

type TimelineItem = {
  id: string;
  type: "base" | "fixed" | "task" | "deadline";
  title: string;
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  startMin: number;
  endMin: number;
};

// AI分解ステップ
type MicroStep = {
  text: string;
  minutes: number;
};

// --- Constants ---
const INITIAL_BASE_SCHEDULES: BaseSchedule[] = [
  { id: "base_sleep_1", title: "睡眠", startTime: "00:00", endTime: "07:00" },
  { id: "base_morning", title: "朝準備", startTime: "07:00", endTime: "08:00" },
  { id: "base_lunch", title: "昼ごはん", startTime: "12:00", endTime: "13:00" },
  { id: "base_dinner", title: "夜ごはん", startTime: "19:00", endTime: "20:00" },
  { id: "base_bath", title: "お風呂", startTime: "22:00", endTime: "23:00" },
];

const DAYS_OF_WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const MAX_CHUNK_MINUTES = 120; 

// --- Utils ---
function timeToMin(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const res = new Date(date);
  res.setDate(res.getDate() + days);
  return res;
}

function getStartOfWeek(date: Date): Date {
  const res = new Date(date);
  const day = res.getDay();
  const diff = res.getDate() - day; 
  res.setDate(diff);
  return res;
}

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// --- Main Component ---
export default function Home() {
  const [hydrated, setHydrated] = useState(false);

  // Data States
  const [baseSchedules, setBaseSchedules] = useState<BaseSchedule[]>([]);
  const [fixedSchedules, setFixedSchedules] = useState<FixedSchedule[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [memo, setMemo] = useState("");

  // UI States
  const [currentView, setCurrentView] = useState<"month" | "week" | "day">("week");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // AI分解・フォーカスモード States
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [focusSteps, setFocusSteps] = useState<MicroStep[]>([]);
  const [focusStepIndex, setFocusStepIndex] = useState(0);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [taskStepsCache, setTaskStepsCache] = useState<Record<string, MicroStep[]>>({});

  // Form States - Base
  const [baseTitle, setBaseTitle] = useState("");
  const [baseStart, setBaseStart] = useState("09:00");
  const [baseEnd, setBaseEnd] = useState("10:00");

  // Form States - Fixed
  const [fixedTitle, setFixedTitle] = useState("");
  const [fixedType, setFixedType] = useState<"once" | "weekly">("once");
  const [fixedDate, setFixedDate] = useState(formatDate(new Date()));
  const [fixedDaysOfWeek, setFixedDaysOfWeek] = useState<number[]>([]);
  const [fixedStart, setFixedStart] = useState("13:00");
  const [fixedEnd, setFixedEnd] = useState("14:00");

  // Form States - Task
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDuration, setTaskDuration] = useState("60");
  const [taskDeadline, setTaskDeadline] = useState(formatDate(addDays(new Date(), 7)));

  // Hydration
  useEffect(() => {
    const bs = localStorage.getItem("v2_baseSchedules");
    const fs = localStorage.getItem("v2_fixedSchedules");
    const t = localStorage.getItem("v2_tasks");
    const m = localStorage.getItem("v2_memo");
    
    if (bs) setBaseSchedules(JSON.parse(bs));
    else setBaseSchedules(INITIAL_BASE_SCHEDULES);
    if (fs) setFixedSchedules(JSON.parse(fs));
    if (t) setTasks(JSON.parse(t));
    if (m) setMemo(m);
    setHydrated(true);
  }, []);

  // Sync
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem("v2_baseSchedules", JSON.stringify(baseSchedules));
      localStorage.setItem("v2_fixedSchedules", JSON.stringify(fixedSchedules));
      localStorage.setItem("v2_tasks", JSON.stringify(tasks));
      localStorage.setItem("v2_memo", memo);
    }
  }, [baseSchedules, fixedSchedules, tasks, memo, hydrated]);

  // --- Add Handlers ---
  const handleAddBase = () => {
    if (!baseTitle.trim()) return alert("予定名を入力してください");
    if (!baseStart || !baseEnd || baseStart >= baseEnd) return alert("正しい時間を入力してください");
    setBaseSchedules([...baseSchedules, { id: Date.now().toString(), title: baseTitle, startTime: baseStart, endTime: baseEnd }]);
    setBaseTitle("");
  };

  const handleAddFixed = () => {
    if (!fixedTitle.trim()) return alert("予定名を入力してください");
    if (!fixedStart || !fixedEnd || fixedStart >= fixedEnd) return alert("正しい時間を入力してください");
    if (fixedType === "once" && !fixedDate) return alert("日付を選択してください");
    if (fixedType === "weekly" && fixedDaysOfWeek.length === 0) return alert("曜日を選択してください");
    
    setFixedSchedules([...fixedSchedules, {
      id: Date.now().toString(),
      title: fixedTitle,
      type: fixedType,
      startTime: fixedStart,
      endTime: fixedEnd,
      date: fixedType === "once" ? fixedDate : undefined,
      daysOfWeek: fixedType === "weekly" ? fixedDaysOfWeek : undefined
    }]);
    setFixedTitle("");
  };

  const handleAddTask = () => {
    if (!taskTitle.trim()) return alert("タスク名を入力してください");
    const dur = parseInt(taskDuration, 10);
    if (isNaN(dur) || dur <= 0) return alert("正しい所要時間を入力してください");
    if (!taskDeadline) return alert("締切日を選択してください");
    
    setTasks([...tasks, {
      id: Date.now().toString(),
      title: taskTitle,
      durationMinutes: dur,
      deadlineDate: taskDeadline
    }]);
    setTaskTitle("");
  };

  const deleteItem = (type: "base"|"fixed"|"task", id: string) => {
    if (type === "base") setBaseSchedules(prev => prev.filter(i => i.id !== id));
    if (type === "fixed") setFixedSchedules(prev => prev.filter(i => i.id !== id));
    if (type === "task") setTasks(prev => prev.filter(i => i.id !== id));
  };

  const toggleDayOfWeek = (day: number) => {
    setFixedDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  // --- AI タスク分解 ---
  const handleBreakdown = async (task: Task) => {
    // キャッシュがあればそのまま表示
    if (taskStepsCache[task.id]) {
      setFocusSteps(taskStepsCache[task.id]);
      setFocusStepIndex(0);
      setFocusTaskId(task.id);
      return;
    }
    setBreakdownLoading(true);
    setFocusTaskId(task.id);
    setFocusStepIndex(0);
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskTitle: task.title, durationMinutes: task.durationMinutes }),
      });
      if (!res.ok) throw new Error("API error");
      const data = await res.json();
      const steps: MicroStep[] = (data.steps ?? []).map((s: { text: string; minutes: number }) => ({
        text: s.text,
        minutes: s.minutes,
      }));
      setTaskStepsCache(prev => ({ ...prev, [task.id]: steps }));
      setFocusSteps(steps);
    } catch {
      alert("タスクの分解に失敗しました。もう一度お試しください。");
      setFocusTaskId(null);
    } finally {
      setBreakdownLoading(false);
    }
  };

  const handleFocusNext = () => setFocusStepIndex(prev => Math.min(prev + 1, focusSteps.length - 1));
  const handleFocusPrev = () => setFocusStepIndex(prev => Math.max(prev - 1, 0));
  const handleFocusClose = () => { setFocusTaskId(null); setFocusSteps([]); setFocusStepIndex(0); };
  const handleReBreakdown = (task: Task) => {
    setTaskStepsCache(prev => { const n = { ...prev }; delete n[task.id]; return n; });
    setFocusTaskId(null);
    setTimeout(() => handleBreakdown(task), 100);
  };

  // --- Auto Scheduler Engine ---
  const { schedulesByDate, unassignedTasks, deadlineWarnings, stats } = useMemo(() => {
    if (!hydrated) return { schedulesByDate: {}, unassignedTasks: [], deadlineWarnings: [], stats: { todayItems: 0, weekTasks: 0, monthItems: 0 } };

    const todayStr = formatDate(new Date());
    const schedByDate: Record<string, TimelineItem[]> = {};
    const unassigned: Task[] = [];
    const warnings: string[] = [];
    
    let stToday = 0;
    let stWeek = 0;
    let stMonth = 0;

    const taskQueue = [...tasks]
      .sort((a, b) => a.deadlineDate.localeCompare(b.deadlineDate))
      .map(t => ({ ...t, remaining: t.durationMinutes }));

    let maxDateStr = todayStr;
    taskQueue.forEach(t => { if (t.deadlineDate > maxDateStr) maxDateStr = t.deadlineDate; });
    const endDate = new Date(maxDateStr);
    endDate.setDate(endDate.getDate() + 30); 

    let currentDate = new Date(todayStr);

    const todayDateObj = new Date();
    const monthStart = getStartOfMonth(todayDateObj);
    const monthEnd = new Date(todayDateObj.getFullYear(), todayDateObj.getMonth() + 1, 0);
    const weekStart = getStartOfWeek(todayDateObj);
    const weekEnd = addDays(weekStart, 6);

    while (currentDate <= endDate) {
      const dateStr = formatDate(currentDate);
      const dayOfWeek = currentDate.getDay();
      
      const dailyItems: TimelineItem[] = [];
      const busyBlocks: {start: number, end: number, id: string, title: string}[] = [];

      baseSchedules.forEach(b => {
        const sMin = timeToMin(b.startTime);
        const eMin = timeToMin(b.endTime);
        dailyItems.push({ id: b.id, type: "base", title: b.title, startTime: b.startTime, endTime: b.endTime, startMin: sMin, endMin: eMin });
        busyBlocks.push({ start: sMin, end: eMin, id: b.id, title: b.title });
      });

      fixedSchedules.forEach(f => {
        let isToday = false;
        if (f.type === "once" && f.date === dateStr) isToday = true;
        if (f.type === "weekly" && f.daysOfWeek?.includes(dayOfWeek)) isToday = true;
        
        if (isToday) {
          const sMin = timeToMin(f.startTime);
          const eMin = timeToMin(f.endTime);
          dailyItems.push({ id: f.id, type: "fixed", title: f.title, startTime: f.startTime, endTime: f.endTime, startMin: sMin, endMin: eMin });
          busyBlocks.push({ start: sMin, end: eMin, id: f.id, title: f.title });
        }
      });

      tasks.filter(t => t.deadlineDate === dateStr).forEach(t => {
        dailyItems.push({ id: `dl-${t.id}`, type: "deadline", title: `締切: ${t.title}`, startTime: "23:59", endTime: "23:59", startMin: 1439, endMin: 1439 });
      });

      busyBlocks.sort((a, b) => a.start - b.start);
      const freeBlocks: {start: number, end: number}[] = [];
      let currentEnd = 0; 
      busyBlocks.forEach(b => {
        if (b.start > currentEnd) freeBlocks.push({ start: currentEnd, end: b.start });
        currentEnd = Math.max(currentEnd, b.end);
      });
      if (currentEnd < 1440) freeBlocks.push({ start: currentEnd, end: 1440 });

      for (let i = 0; i < freeBlocks.length; i++) {
        let block = freeBlocks[i];
        let madeProgress = true;

        while (block.start < block.end && madeProgress) {
          madeProgress = false;
          for (let j = 0; j < taskQueue.length; j++) {
            const task = taskQueue[j];
            if (task.remaining <= 0 || task.deadlineDate < dateStr) continue;

            const blockDur = block.end - block.start;
            const allocate = Math.min(blockDur, task.remaining, MAX_CHUNK_MINUTES);

            if (allocate > 0) {
              const labelSuffix = task.durationMinutes > allocate ? ` (${task.durationMinutes - task.remaining + allocate}/${task.durationMinutes})` : "";
              dailyItems.push({
                id: `${task.id}-chunk-${task.remaining}`,
                type: "task",
                title: task.title + labelSuffix,
                startTime: minToTime(block.start),
                endTime: minToTime(block.start + allocate),
                startMin: block.start,
                endMin: block.start + allocate
              });
              task.remaining -= allocate;
              block.start += allocate;
              madeProgress = true;
              break; 
            }
          }
        }
      }

      dailyItems.sort((a, b) => a.startMin - b.startMin);
      schedByDate[dateStr] = dailyItems;

      // Stats calculation
      const hasFixedOrTask = dailyItems.filter(i => i.type === "fixed" || i.type === "task").length;
      if (dateStr === todayStr) stToday += hasFixedOrTask;
      if (currentDate >= weekStart && currentDate <= weekEnd) {
         stWeek += dailyItems.filter(i => i.type === "task").length;
      }
      if (currentDate >= monthStart && currentDate <= monthEnd) {
         stMonth += hasFixedOrTask;
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    taskQueue.forEach(t => {
      if (t.remaining > 0) {
        unassigned.push({ ...t, durationMinutes: t.remaining });
        warnings.push(`「${t.title}」は締切日までに${t.remaining}分配置できませんでした。`);
      }
    });

    return { 
      schedulesByDate: schedByDate, 
      unassignedTasks: unassigned, 
      deadlineWarnings: warnings,
      stats: { todayItems: stToday, weekTasks: stWeek, monthItems: stMonth }
    };
  }, [baseSchedules, fixedSchedules, tasks, hydrated]);

  // --- Components ---
  const TitleCard = ({ title, value, colorClass }: { title: string, value: number | string, colorClass: string }) => (
    <div className={`p-5 rounded-3xl border-2 border-slate-800 shadow-[4px_4px_0px_rgba(30,41,59,1)] flex flex-col justify-center items-center ${colorClass} hover:-translate-y-1 hover:shadow-[6px_6px_0px_rgba(30,41,59,1)] transition-all`}>
      <p className="text-sm font-bold text-slate-700">{title}</p>
      <p className="text-3xl font-black text-slate-900 mt-2">{value}</p>
    </div>
  );

  if (!hydrated) return <div className="min-h-screen bg-[#FFFDF5]" />;

  const todayStr = formatDate(new Date());

  // Rendering logic for views
  const renderMonthView = () => {
    const startObj = getStartOfMonth(selectedDate);
    const gridStart = getStartOfWeek(startObj);
    const weeks = [];
    let current = new Date(gridStart);

    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = formatDate(current);
        const isCurrentMonth = current.getMonth() === startObj.getMonth();
        const isSelected = dateStr === formatDate(selectedDate);
        const isToday = dateStr === todayStr;
        const dayItems = schedulesByDate[dateStr] || [];
        
        days.push(
          <div 
            key={dateStr} 
            onClick={() => { setSelectedDate(new Date(dateStr)); setCurrentView("day"); }}
            className={`min-h-[100px] p-2 border-r-2 border-b-2 border-slate-800 cursor-pointer transition-colors ${isCurrentMonth ? "bg-white" : "bg-slate-100"} ${isSelected ? "bg-yellow-100" : "hover:bg-yellow-50"} ${d===0?"border-l-2":""}`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-sm font-black w-7 h-7 flex items-center justify-center rounded-full ${isToday ? "bg-slate-800 text-white" : "text-slate-700"}`}>
                {current.getDate()}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {dayItems.slice(0, 3).map((item, idx) => (
                item.type !== "base" && (
                  <div key={idx} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate border-2 border-slate-800 ${item.type==='task'?'bg-orange-300':item.type==='fixed'?'bg-sky-300':'bg-pink-300'}`}>
                    {item.title}
                  </div>
                )
              ))}
              {dayItems.filter(i => i.type!=="base").length > 3 && <div className="text-[10px] font-bold text-slate-500 pl-1">他 {dayItems.filter(i => i.type!=="base").length - 3}件</div>}
            </div>
          </div>
        );
        current.setDate(current.getDate() + 1);
      }
      weeks.push(<div key={w} className="grid grid-cols-7">{days}</div>);
    }

    return (
      <div className="bg-white rounded-3xl border-2 border-slate-800 shadow-[8px_8px_0px_rgba(30,41,59,1)] overflow-hidden">
        <div className="flex items-center justify-between p-4 bg-[#E0F2FE] border-b-2 border-slate-800">
          <button onClick={() => setSelectedDate(addDays(startObj, -30))} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-full font-black hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none transition-all">◀</button>
          <h2 className="text-2xl font-black text-slate-800">{startObj.getFullYear()}年 {startObj.getMonth() + 1}月</h2>
          <button onClick={() => setSelectedDate(addDays(startObj, 31))} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-full font-black hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none transition-all">▶</button>
        </div>
        <div className="grid grid-cols-7 bg-white border-b-2 border-slate-800">
          {DAYS_OF_WEEK.map((d, i) => (
            <div key={d} className={`text-center text-sm font-black py-3 border-r-2 border-slate-800 last:border-r-0 ${i === 0 ? "text-pink-500" : i === 6 ? "text-sky-500" : "text-slate-800"}`}>{d}</div>
          ))}
        </div>
        <div className="border-t-0">{weeks}</div>
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = getStartOfWeek(selectedDate);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-[#D1FAE5] border-2 border-slate-800 rounded-3xl shadow-[4px_4px_0px_rgba(30,41,59,1)]">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-full font-black hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)]">◀</button>
          <h2 className="text-xl font-black text-slate-800">{formatDate(weekStart)} の週</h2>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="w-10 h-10 bg-white border-2 border-slate-800 rounded-full font-black hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)]">▶</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {Array.from({length: 7}).map((_, i) => {
            const d = addDays(weekStart, i);
            const dateStr = formatDate(d);
            const isToday = dateStr === todayStr;
            const items = schedulesByDate[dateStr] || [];
            
            return (
              <div key={i} className={`bg-white rounded-3xl border-2 border-slate-800 p-4 min-h-[400px] flex flex-col ${isToday ? 'shadow-[8px_8px_0px_rgba(251,146,60,1)] -translate-y-2' : 'shadow-[4px_4px_0px_rgba(30,41,59,1)]'} transition-transform`}>
                <div className={`text-center mb-4 pb-3 border-b-2 border-slate-200`}>
                  <p className={`text-sm font-black ${isToday ? 'text-orange-500' : 'text-slate-500'}`}>{DAYS_OF_WEEK[d.getDay()]}</p>
                  <p className={`text-2xl font-black ${isToday ? 'text-slate-900' : 'text-slate-700'}`}>{d.getDate()}</p>
                </div>
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {items.filter(item => item.type !== "base").map(item => (
                    <div key={item.id} className={`text-xs p-3 rounded-2xl border-2 border-slate-800 font-bold ${item.type === 'fixed' ? 'bg-[#BAE6FD]' : item.type === 'deadline' ? 'bg-[#FECDD3]' : 'bg-[#FDBA74]'}`}>
                      <p className="truncate text-slate-900 text-sm mb-1">{item.title}</p>
                      {item.type !== 'deadline' && <p className="text-[10px] opacity-80">{item.startTime}</p>}
                    </div>
                  ))}
                  {items.filter(item => item.type !== "base").length === 0 && <p className="text-sm font-bold text-slate-300 text-center mt-6">予定なし！</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const dateStr = formatDate(selectedDate);
    const items = schedulesByDate[dateStr] || [];
    
    return (
      <div className="bg-white rounded-3xl border-2 border-slate-800 shadow-[8px_8px_0px_rgba(30,41,59,1)] p-6 md:p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8 border-b-2 border-slate-800 pb-6">
          <button onClick={() => setSelectedDate(addDays(selectedDate, -1))} className="w-12 h-12 bg-yellow-300 border-2 border-slate-800 rounded-full font-black text-xl hover:bg-yellow-400 shadow-[4px_4px_0px_rgba(30,41,59,1)]">◀</button>
          <div className="text-center">
            <h2 className="text-3xl font-black text-slate-800">
               {selectedDate.getFullYear()}/{selectedDate.getMonth() + 1}/{selectedDate.getDate()}
            </h2>
            <p className="text-lg font-bold text-slate-500 mt-1">{DAYS_OF_WEEK[selectedDate.getDay()]}曜日 {dateStr === todayStr ? "⭐ 今日" : ""}</p>
          </div>
          <button onClick={() => setSelectedDate(addDays(selectedDate, 1))} className="w-12 h-12 bg-yellow-300 border-2 border-slate-800 rounded-full font-black text-xl hover:bg-yellow-400 shadow-[4px_4px_0px_rgba(30,41,59,1)]">▶</button>
        </div>

        <div className="relative border-l-4 border-slate-800 ml-4 md:ml-8 space-y-8 py-4">
          {items.map(item => (
             <div key={item.id} className="relative pl-8">
               {/* Dot */}
               <div className={`absolute -left-[14px] top-6 w-6 h-6 rounded-full border-4 border-slate-800 ${item.type === "fixed" ? "bg-sky-400" : item.type === "task" ? "bg-orange-400" : item.type === "deadline" ? "bg-pink-500" : "bg-stone-300"}`}></div>
               
               {/* Card */}
               <div className={`p-5 rounded-3xl border-2 border-slate-800 shadow-[4px_4px_0px_rgba(30,41,59,1)] ${item.type === "fixed" ? "bg-[#E0F2FE]" : item.type === "task" ? "bg-[#FFEDD5]" : item.type === "deadline" ? "bg-[#FFE4E6]" : "bg-stone-100"}`}>
                 <div className="flex justify-between items-start mb-2">
                   <span className={`text-xs font-black px-3 py-1 rounded-full border-2 border-slate-800 bg-white`}>
                     {item.type === "fixed" ? "予定📌" : item.type === "task" ? "タスク📝" : item.type === "deadline" ? "締切🚨" : "生活☕️"}
                   </span>
                   <span className={`font-mono text-sm font-black text-slate-700`}>
                      {item.type === "deadline" ? item.title : `${item.startTime} - ${item.endTime}`}
                   </span>
                 </div>
                 {item.type !== "deadline" && (
                   <h3 className={`font-black text-xl mt-3 text-slate-900`}>{item.title}</h3>
                 )}
               </div>
             </div>
          ))}
          {items.length === 0 && <p className="pl-8 text-slate-400 font-bold">この日の予定はありません。</p>}
        </div>
      </div>
    );
  };

  // 今やること フォーカスモード オーバーレイ
  const focusTask = tasks.find(t => t.id === focusTaskId);
  const FocusOverlay = () => {
    if (!focusTaskId) return null;
    const currentStep = focusSteps[focusStepIndex];
    const isLast = focusStepIndex === focusSteps.length - 1;
    const progress = focusSteps.length > 0 ? ((focusStepIndex) / focusSteps.length) * 100 : 0;

    return (
      <div className="fixed inset-0 z-50 bg-[#F0FDF4] flex flex-col items-center justify-center p-6 overflow-y-auto">
        {/* ヘッダー */}
        <div className="w-full max-w-md flex justify-between items-start mb-8">
          <div>
            <span className="inline-block text-xs font-black text-green-700 bg-green-200 px-3 py-1 rounded-full border-2 border-green-700">
              🎯 今やること
            </span>
            <p className="text-sm font-bold text-slate-500 mt-2 max-w-[200px] truncate">
              {focusTask?.title}
            </p>
          </div>
          <button
            onClick={handleFocusClose}
            className="w-10 h-10 bg-white border-2 border-slate-800 rounded-full font-black hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)] shrink-0"
          >✕</button>
        </div>

        {breakdownLoading ? (
          /* ローディング */
          <div className="flex flex-col items-center gap-6">
            <div className="relative w-20 h-20">
              <div className="absolute inset-0 border-4 border-green-200 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-t-green-500 rounded-full animate-spin"></div>
            </div>
            <div className="text-center">
              <p className="font-black text-slate-800 text-lg">AIがタスクを分解中...</p>
              <p className="text-sm font-bold text-slate-500 mt-1">「{focusTask?.title}」を小さなステップに！</p>
            </div>
          </div>
        ) : (
          <>
            {/* プログレスバー */}
            <div className="w-full max-w-md mb-6">
              <div className="flex justify-between text-sm font-black text-slate-500 mb-2">
                <span>ステップ {focusStepIndex + 1} / {focusSteps.length}</span>
                {currentStep && <span>⏱ 約{currentStep.minutes}分</span>}
              </div>
              <div className="w-full h-3 bg-slate-200 rounded-full border-2 border-slate-800 overflow-hidden">
                <div
                  className="h-full bg-green-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* メインステップ表示 */}
            <div className="w-full max-w-md bg-white border-4 border-slate-800 rounded-3xl p-10 shadow-[8px_8px_0px_rgba(30,41,59,1)] text-center mb-8">
              <p className="text-3xl md:text-4xl font-black text-slate-900 leading-tight">
                {currentStep?.text ?? "完了！"}
              </p>
            </div>

            {/* ステップ一覧（小さく） */}
            <div className="w-full max-w-md mb-6 space-y-1">
              {focusSteps.map((s, i) => (
                <div
                  key={i}
                  onClick={() => setFocusStepIndex(i)}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition-colors ${
                    i === focusStepIndex
                      ? "bg-green-100 border-2 border-green-600"
                      : i < focusStepIndex
                      ? "opacity-40 bg-slate-50"
                      : "bg-white border-2 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full border-2 border-slate-800 flex items-center justify-center text-xs font-black shrink-0 ${
                    i < focusStepIndex ? "bg-green-400 text-white" : i === focusStepIndex ? "bg-green-200" : "bg-white"
                  }`}>
                    {i < focusStepIndex ? "✓" : i + 1}
                  </span>
                  <span className="text-xs font-bold text-slate-700 truncate">{s.text}</span>
                  <span className="text-[10px] font-black text-slate-400 shrink-0">{s.minutes}分</span>
                </div>
              ))}
            </div>

            {/* アクションボタン */}
            <div className="w-full max-w-md flex flex-col gap-3">
              {!isLast ? (
                <button
                  onClick={handleFocusNext}
                  className="w-full py-5 bg-green-400 text-white font-black text-xl rounded-2xl border-2 border-slate-800 hover:bg-green-500 transition-all shadow-[4px_4px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none"
                >
                  ✅ 完了！次へ →
                </button>
              ) : (
                <button
                  onClick={handleFocusClose}
                  className="w-full py-5 bg-yellow-400 text-slate-900 font-black text-xl rounded-2xl border-2 border-slate-800 hover:bg-yellow-500 transition-all shadow-[4px_4px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none"
                >
                  🎉 全ステップ完了！おつかれさま
                </button>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleFocusPrev}
                  disabled={focusStepIndex === 0}
                  className="flex-1 py-3 bg-white font-black text-sm rounded-2xl border-2 border-slate-800 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed shadow-[2px_2px_0px_rgba(30,41,59,1)]"
                >
                  ← 戻る
                </button>
                {focusTask && (
                  <button
                    onClick={() => handleReBreakdown(focusTask)}
                    className="flex-1 py-3 bg-white font-black text-sm rounded-2xl border-2 border-slate-800 hover:bg-slate-100 shadow-[2px_2px_0px_rgba(30,41,59,1)]"
                  >
                    🔄 再分解
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-[#FFFDF5] text-slate-800 font-sans selection:bg-yellow-200">
      <FocusOverlay />
      
      {/* Sidebar */}
      <aside className="w-full md:w-64 lg:w-72 border-b-2 md:border-b-0 md:border-r-2 border-slate-800 bg-white p-6 flex flex-col shrink-0 sticky top-0 h-auto md:h-screen overflow-y-auto z-40">
        <div className="flex items-center gap-2 mb-8 mt-2">
          <div className="w-10 h-10 bg-yellow-400 rounded-full border-2 border-slate-800 flex items-center justify-center text-xl shadow-[2px_2px_0px_rgba(30,41,59,1)]">⭐</div>
          <h1 className="text-2xl font-black tracking-tight leading-none">Plan<br/>Dear</h1>
        </div>
        
        <nav className="flex flex-col gap-3 font-bold mb-10">
          <a href="#calendar" className="p-3 rounded-2xl hover:bg-yellow-100 transition-colors border-2 border-transparent hover:border-slate-800 text-slate-700 hover:text-slate-900 flex items-center gap-2">📅 カレンダー</a>
          <a href="#management" className="p-3 rounded-2xl hover:bg-sky-100 transition-colors border-2 border-transparent hover:border-slate-800 text-slate-700 hover:text-slate-900 flex items-center gap-2">📝 タスクと予定</a>
          <a href="#pickup" className="p-3 rounded-2xl hover:bg-green-100 transition-colors border-2 border-transparent hover:border-slate-800 text-slate-700 hover:text-slate-900 flex items-center gap-2">✨ 機能紹介</a>
        </nav>

        <div className="mt-auto">
          <label className="block text-sm font-black mb-2 text-slate-700">📌 ひとことメモ</label>
          <textarea 
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="今日の目標は？"
            className="w-full h-32 p-3 bg-yellow-50 border-2 border-slate-800 rounded-2xl focus:outline-none focus:bg-yellow-100 resize-none text-sm font-bold shadow-[4px_4px_0px_rgba(30,41,59,1)]"
          />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-x-hidden relative scroll-smooth">
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-16">
          
          {/* Hero Banner */}
          <section className="bg-[#FFE45E] border-2 border-slate-800 rounded-[2rem] p-8 md:p-14 shadow-[8px_8px_0px_rgba(30,41,59,1)] relative overflow-hidden flex flex-col md:flex-row items-center justify-between">
            <div className="z-10 relative space-y-6">
              <span className="inline-block bg-blue-600 text-white font-black px-4 py-1.5 rounded-full text-sm border-2 border-slate-800 -rotate-2">学生の毎日を、もっとスマートに！</span>
              <h2 className="text-5xl md:text-7xl font-black text-slate-900 leading-tight tracking-tight">
                Plan<br/>Your Day,<br/>Your Way!
              </h2>
              <p className="text-lg md:text-xl font-bold text-slate-800">
                生活リズムも、予定も、やることも。<br/>ぜんぶまとめて、見える化しよう！
              </p>
              <div className="flex gap-4 pt-4">
                <a href="#management" className="bg-slate-900 text-white font-black px-8 py-4 rounded-full hover:bg-slate-800 transition-transform hover:-translate-y-1 border-2 border-slate-900 shadow-[4px_4px_0px_rgba(30,41,59,0.5)]">無料で始める →</a>
              </div>
            </div>
            
            {/* Pop Art Elements (CSS/Emojis) */}
            <div className="relative w-full md:w-1/2 h-64 md:h-auto mt-8 md:mt-0 flex justify-center items-center">
               <div className="absolute top-0 right-10 text-6xl drop-shadow-md animate-bounce">⏰</div>
               <div className="absolute bottom-10 left-10 text-7xl drop-shadow-md -rotate-12">📝</div>
               <div className="absolute top-1/2 right-1/4 text-8xl drop-shadow-md rotate-6">📅</div>
               <div className="absolute -bottom-4 right-0 text-7xl drop-shadow-md">🌿</div>
               <div className="absolute top-10 left-1/4 bg-pink-300 border-2 border-slate-800 font-black p-3 rounded-2xl rotate-12 shadow-[4px_4px_0px_rgba(30,41,59,1)]">To do list<br/>☑︎...<br/>☑︎...</div>
               <div className="absolute bottom-1/4 right-1/3 bg-white border-2 border-slate-800 font-black px-4 py-2 rounded-[2rem] rounded-bl-none shadow-[4px_4px_0px_rgba(30,41,59,1)]">Let's<br/>plan it!</div>
            </div>
          </section>

          {/* Warnings */}
          {deadlineWarnings.length > 0 && (
            <div className="bg-[#FECDD3] border-2 border-slate-800 rounded-3xl p-6 shadow-[4px_4px_0px_rgba(30,41,59,1)]">
              <h3 className="font-black text-rose-600 text-xl mb-2">🚨 締切アラート</h3>
              <ul className="font-bold text-slate-800 space-y-1 list-disc list-inside">
                {deadlineWarnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* Summary Cards */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <TitleCard title="今日の予定" value={`${stats.todayItems}件`} colorClass="bg-[#E0F2FE]" />
            <TitleCard title="今週のタスク" value={`${stats.weekTasks}件`} colorClass="bg-[#D1FAE5]" />
            <TitleCard title="未完了タスク" value={`${unassignedTasks.length}件`} colorClass="bg-[#FFEDD5]" />
            <TitleCard title="今月の予定" value={`${stats.monthItems}件`} colorClass="bg-[#FEF08A]" />
          </section>

          {/* Calendar Section */}
          <section id="calendar" className="space-y-6 pt-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4">
               <div>
                  <h2 className="text-3xl font-black flex items-center gap-2">📅 スケジュール</h2>
                  <p className="font-bold text-slate-500 mt-2">いつ何をするか、全体像をチェック！</p>
               </div>
               <div className="flex bg-white border-2 border-slate-800 p-1 rounded-2xl shadow-[4px_4px_0px_rgba(30,41,59,1)]">
                {(["day", "week", "month"] as const).map(view => (
                  <button 
                    key={view}
                    onClick={() => setCurrentView(view)}
                    className={`px-8 py-2 rounded-xl text-sm font-black transition-all ${currentView === view ? "bg-yellow-300 border-2 border-slate-800" : "text-slate-500 border-2 border-transparent hover:text-slate-900"}`}
                  >
                    {view === "day" ? "日" : view === "week" ? "週" : "月"}
                  </button>
                ))}
              </div>
            </div>
            {currentView === "month" && renderMonthView()}
            {currentView === "week" && renderWeekView()}
            {currentView === "day" && renderDayView()}
          </section>

          {/* 3-Column Management Area */}
          <section id="management" className="pt-16 border-t-4 border-dashed border-slate-200">
             <div className="mb-8 text-center">
                <h2 className="text-3xl font-black">⚙️ 予定とタスクの管理</h2>
                <p className="font-bold text-slate-500 mt-2">追加した要素は自動でカレンダーに組み込まれます。</p>
             </div>
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Tasks Column */}
                <div className="bg-[#FFF7ED] border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] flex flex-col">
                   <h3 className="text-xl font-black mb-4 flex items-center gap-2">📝 タスク</h3>
                   
                   <div className="bg-white p-4 rounded-2xl border-2 border-slate-800 mb-6 space-y-3">
                      <input className="w-full font-bold border-b-2 border-slate-200 p-2 focus:outline-none focus:border-orange-400" placeholder="タスク名 (例: レポート)" value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} />
                      <div className="flex items-center gap-2 text-sm font-bold">
                         <span>⏰</span>
                         <input type="number" className="w-16 border-b-2 border-slate-200 p-1 text-center focus:outline-none" value={taskDuration} onChange={e=>setTaskDuration(e.target.value)} /> 分
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold">
                         <span>🚨</span>
                         <input type="date" className="flex-1 border-b-2 border-slate-200 p-1 focus:outline-none" value={taskDeadline} onChange={e=>setTaskDeadline(e.target.value)} /> まで
                      </div>
                      <button onClick={handleAddTask} className="w-full bg-orange-400 text-white font-black py-2 rounded-xl border-2 border-slate-800 hover:bg-orange-500 transition-colors mt-2 shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none">追加する</button>
                   </div>

                   <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] pr-2">
                     {tasks.map(t => (
                        <div key={t.id} className="bg-white p-3 rounded-2xl border-2 border-slate-800 group">
                           <div className="flex justify-between items-start mb-2">
                             <div className="flex-1 min-w-0">
                               <p className="font-black text-sm truncate">{t.title}</p>
                               <p className="text-[10px] font-bold text-slate-500">{t.durationMinutes}分 / 締切: {t.deadlineDate}</p>
                             </div>
                             <button onClick={()=>deleteItem('task', t.id)} className="w-7 h-7 bg-rose-100 text-rose-600 rounded-full font-black border-2 border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0 text-xs">×</button>
                           </div>
                           {/* 🎯 AI分解ボタン */}
                           <button
                             onClick={() => handleBreakdown(t)}
                             className="w-full py-1.5 bg-green-400 text-white font-black text-xs rounded-xl border-2 border-slate-800 hover:bg-green-500 transition-colors shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-1"
                           >
                             🎯 今やることに分解する
                           </button>
                        </div>
                     ))}
                   </div>
                </div>

                {/* Base Column */}
                <div className="bg-[#F3F4F6] border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] flex flex-col">
                   <h3 className="text-xl font-black mb-4 flex items-center gap-2">☕️ 基本生活</h3>
                   
                   <div className="bg-white p-4 rounded-2xl border-2 border-slate-800 mb-6 space-y-3">
                      <input className="w-full font-bold border-b-2 border-slate-200 p-2 focus:outline-none focus:border-slate-400" placeholder="生活名 (例: 睡眠)" value={baseTitle} onChange={e=>setBaseTitle(e.target.value)} />
                      <div className="flex items-center gap-2 text-sm font-bold">
                         <input type="time" className="flex-1 border-b-2 border-slate-200 p-1 focus:outline-none" value={baseStart} onChange={e=>setBaseStart(e.target.value)} />
                         <span>-</span>
                         <input type="time" className="flex-1 border-b-2 border-slate-200 p-1 focus:outline-none" value={baseEnd} onChange={e=>setBaseEnd(e.target.value)} />
                      </div>
                      <button onClick={handleAddBase} className="w-full bg-slate-200 text-slate-800 font-black py-2 rounded-xl border-2 border-slate-800 hover:bg-slate-300 transition-colors mt-2 shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none">追加する</button>
                   </div>

                   <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] pr-2">
                     {baseSchedules.map(b => (
                        <div key={b.id} className="bg-white p-3 rounded-2xl border-2 border-slate-800 flex justify-between items-center group">
                           <div>
                              <p className="font-black text-sm">{b.title}</p>
                              <p className="text-[10px] font-bold text-slate-500">{b.startTime} - {b.endTime}</p>
                           </div>
                           <button onClick={()=>deleteItem('base', b.id)} className="w-8 h-8 bg-rose-100 text-rose-600 rounded-full font-black border-2 border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                     ))}
                   </div>
                </div>

                {/* Fixed Column */}
                <div className="bg-[#E0F2FE] border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] flex flex-col">
                   <h3 className="text-xl font-black mb-4 flex items-center gap-2">📌 固定予定</h3>
                   
                   <div className="bg-white p-4 rounded-2xl border-2 border-slate-800 mb-6 space-y-3">
                      <input className="w-full font-bold border-b-2 border-slate-200 p-2 focus:outline-none focus:border-sky-400" placeholder="予定名 (例: バイト)" value={fixedTitle} onChange={e=>setFixedTitle(e.target.value)} />
                      
                      <div className="flex gap-2">
                        <button onClick={()=>setFixedType("once")} className={`flex-1 text-xs font-black py-1 rounded-lg border-2 ${fixedType==='once'?'bg-sky-200 border-slate-800':'bg-stone-50 border-transparent text-slate-400'}`}>単発</button>
                        <button onClick={()=>setFixedType("weekly")} className={`flex-1 text-xs font-black py-1 rounded-lg border-2 ${fixedType==='weekly'?'bg-sky-200 border-slate-800':'bg-stone-50 border-transparent text-slate-400'}`}>毎週</button>
                      </div>

                      {fixedType === "once" ? (
                         <input type="date" className="w-full font-bold text-sm border-b-2 border-slate-200 p-1 focus:outline-none" value={fixedDate} onChange={e=>setFixedDate(e.target.value)} />
                      ) : (
                         <div className="flex gap-1 justify-between">
                           {DAYS_OF_WEEK.map((d,i) => (
                              <button key={i} onClick={()=>toggleDayOfWeek(i)} className={`w-7 h-7 rounded-full text-xs font-black border-2 ${fixedDaysOfWeek.includes(i) ? 'bg-sky-400 border-slate-800 text-white' : 'bg-stone-50 border-transparent text-slate-400'}`}>{d[0]}</button>
                           ))}
                         </div>
                      )}

                      <div className="flex items-center gap-2 text-sm font-bold">
                         <input type="time" className="flex-1 border-b-2 border-slate-200 p-1 focus:outline-none" value={fixedStart} onChange={e=>setFixedStart(e.target.value)} />
                         <span>-</span>
                         <input type="time" className="flex-1 border-b-2 border-slate-200 p-1 focus:outline-none" value={fixedEnd} onChange={e=>setFixedEnd(e.target.value)} />
                      </div>
                      <button onClick={handleAddFixed} className="w-full bg-sky-400 text-white font-black py-2 rounded-xl border-2 border-slate-800 hover:bg-sky-500 transition-colors mt-2 shadow-[2px_2px_0px_rgba(30,41,59,1)] active:translate-y-0.5 active:shadow-none">追加する</button>
                   </div>

                   <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px] pr-2">
                     {fixedSchedules.map(f => (
                        <div key={f.id} className="bg-white p-3 rounded-2xl border-2 border-slate-800 flex justify-between items-center group">
                           <div>
                              <p className="font-black text-sm">{f.title}</p>
                              <p className="text-[10px] font-bold text-slate-500">
                                 {f.type === 'once' ? f.date : f.daysOfWeek?.map(d=>DAYS_OF_WEEK[d]).join(', ')} | {f.startTime} - {f.endTime}
                              </p>
                           </div>
                           <button onClick={()=>deleteItem('fixed', f.id)} className="w-8 h-8 bg-rose-100 text-rose-600 rounded-full font-black border-2 border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                     ))}
                   </div>
                </div>

             </div>
          </section>

          {/* Pick up Section */}
          <section id="pickup" className="pt-16 pb-12">
             <div className="text-center mb-10">
               <span className="text-4xl">✨</span>
               <h2 className="text-4xl font-black mt-2">What's Special?</h2>
               <p className="font-bold text-slate-500 mt-2">PlanDearのここがすごい！</p>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] text-center">
                   <div className="text-5xl mb-4">📅</div>
                   <h3 className="font-black text-lg mb-2">スケジュール管理</h3>
                   <p className="text-xs font-bold text-slate-500">授業やバイトなどの予定をカレンダーでまとめて管理！</p>
                </div>
                <div className="bg-white border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] text-center">
                   <div className="text-5xl mb-4">📝</div>
                   <h3 className="font-black text-lg mb-2">タスク管理</h3>
                   <p className="text-xs font-bold text-slate-500">やること・時間・締切を設定してやるべきことが一目でわかる！</p>
                </div>
                <div className="bg-white border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] text-center">
                   <div className="text-5xl mb-4">🤖</div>
                   <h3 className="font-black text-lg mb-2">時間の見える化</h3>
                   <p className="text-xs font-bold text-slate-500">空き時間にタスクを自動で配置！無理のない計画をサポート。</p>
                </div>
                <div className="bg-white border-2 border-slate-800 rounded-3xl p-6 shadow-[6px_6px_0px_rgba(30,41,59,1)] text-center">
                   <div className="text-5xl mb-4">🐕</div>
                   <h3 className="font-black text-lg mb-2">生活リズムも一緒に</h3>
                   <p className="text-xs font-bold text-slate-500">睡眠や食事などのベース予定も設定して、毎日を整えよう！</p>
                </div>
             </div>
          </section>

        </div>
      </main>

    </div>
  );
}