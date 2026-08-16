(() => {
  const cfg = window.ATTENDANCE_CONFIG;
  const form = document.getElementById("student-login-form");
  const message = document.getElementById("login-message");
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
    message.textContent = "Supabase is not configured yet. Add the public URL and anon/publishable key in js/config.js.";
    message.className = "message error";
    return;
  }
  const supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const setMessage = (text, type = "") => { message.textContent = text; message.className = `message ${type}`; };
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const studentId = document.getElementById("student-id").value.trim().toUpperCase();
    const password = document.getElementById("student-password").value;
    if (!studentId || !password) return setMessage("Enter both your Student ID and password.", "error");
    const button = form.querySelector("button[type=submit]");
    button.disabled = true; button.textContent = "Signing in…"; setMessage("");
    try {
      const { data, error } = await supabase.rpc("student_login_and_mark_present", { p_student_id: studentId, p_password: password });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.success) throw new Error(row?.message || "Invalid Student ID or password.");
      setMessage(`Attendance recorded successfully. Welcome, ${row.student_name}.`, "success");
      form.reset();
    } catch (error) {
      console.error(error);
      setMessage(error.message === "Invalid Student ID or password." ? error.message : "Login failed. Please check your details and try again.", "error");
    } finally {
      button.disabled = false; button.textContent = "Sign in";
    }
  });
})();
