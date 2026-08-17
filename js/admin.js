(() => {
  const cfg = window.ATTENDANCE_CONFIG;
  const loader = document.getElementById("app-loader");
  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY) {
    loader.innerHTML = "<strong>Supabase is not configured.</strong><span>Add the public URL and anon/publishable key in js/config.js.</span>";
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const $ = id => document.getElementById(id);
  const message = (text, type="") => { $("global-message").textContent=text; $("global-message").className=`message ${type}`; };

  async function boot() {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { location.replace("admin-login.html"); return; }
      const { data: profile, error } = await sb.from("admin_profiles").select("id").eq("id", session.user.id).maybeSingle();
      if (error || !profile) { await sb.auth.signOut(); location.replace("admin-login.html"); return; }
      setup();
      await Promise.all([loadStudents(), loadAttendance()]);
    } catch (e) {
      console.error(e); message("Unable to load the dashboard: " + (e.message || e), "error");
    } finally { loader.classList.add("hidden");
              loader.style.display = "none";
              }
  }

  function setup() {
    $("logout-btn").onclick = async () => { await sb.auth.signOut(); location.replace("admin-login.html"); };
    $("attendance-date").value = localDate();
    $("attendance-date").addEventListener("change", loadAttendance);
    $("add-student-btn").onclick = () => openDialog();
    $("dialog-close").onclick = closeDialog;
    $("cancel-btn").onclick = closeDialog;
    $("student-form").addEventListener("submit", saveStudent);
  }

  function localDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date);
    return `${parts.find(x=>x.type==="year").value}-${parts.find(x=>x.type==="month").value}-${parts.find(x=>x.type==="day").value}`;
  }

  async function loadStudents() {
    const { data, error } = await sb.from("students").select("student_id,name").order("student_id", { ascending:true });
    if (error) throw error;
    $("total-students").textContent = data.length;
    const body = $("students-body"); body.innerHTML = "";
    $("students-empty").classList.toggle("hidden", data.length !== 0);
    data.forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td><strong>${esc(s.student_id)}</strong></td><td>${esc(s.name)}</td><td><div class="actions"><button class="btn ghost small" data-edit="${esc(s.student_id)}">Edit</button><button class="btn danger small" data-delete="${esc(s.student_id)}">Delete</button></div></td>`;
      body.appendChild(tr);
    });
    body.querySelectorAll("[data-edit]").forEach(b => b.onclick=()=>openDialog(b.dataset.edit));
    body.querySelectorAll("[data-delete]").forEach(b => b.onclick=()=>deleteStudent(b.dataset.delete));
  }

  async function loadAttendance() {
    const date = $("attendance-date").value || localDate();
    const { data, error } = await sb.rpc("admin_get_attendance", { p_date: date });
    if (error) throw error;
    const body = $("attendance-body"); body.innerHTML = "";
    $("attendance-empty").classList.toggle("hidden", data.length !== 0);
    let present = 0;
    data.forEach(r => {
      if (r.status === "Present") present++;
      const tr=document.createElement("tr");
      tr.innerHTML=`<td><strong>${esc(r.student_id)}</strong></td><td>${esc(r.name || "—")}</td><td>${esc(r.date)}</td><td><span class="badge ${r.status==="Present"?"present":"absent"}">${esc(r.status)}</span></td>`;
      body.appendChild(tr);
    });
    if (date === localDate()) { $("present-today").textContent=present; $("absent-today").textContent=Math.max(0, Number($("total-students").textContent||0)-present); }
  }

  async function openDialog(id=null) {
    $("student-form").reset(); $("form-message").textContent=""; $("form-message").className="message";
    $("original-student-id").value=id||"";
    $("dialog-title").textContent=id?"Edit student":"Add student";
    $("dialog-eyebrow").textContent=id?"Student management":"New student";
    $("student-id-help").textContent=id?"Student ID cannot be changed while editing.":"Use the format STU001, STU002, etc.";
    $("password-help").textContent=id?"Leave blank to keep the current password.":"Required when adding.";
    $("form-student-id").disabled=!!id;
    $("form-password").required=!id;
    if(id){
      const {data,error}=await sb.from("students").select("student_id,name").eq("student_id",id).single();
      if(error) return message("Could not load that student.","error");
      $("form-student-id").value=data.student_id; $("form-name").value=data.name;
    }
    $("student-dialog").showModal();
  }
  function closeDialog(){ $("student-dialog").close(); }
  async function saveStudent(e){
    e.preventDefault();
    const original=$("original-student-id").value;
    const id=$("form-student-id").value.trim().toUpperCase();
    const name=$("form-name").value.trim();
    const password=$("form-password").value;
    const fm=$("form-message"); fm.textContent=""; fm.className="message";
    if(!/^STU\d{3,}$/.test(id)) return fm.textContent="Student ID must look like STU001.";
    if(!name) return fm.textContent="Student name is required.";
    if(!original && !password) return fm.textContent="Password/access code is required.";
    const save=e.submitter; save.disabled=true; save.textContent="Saving…";
    try{
      if(original){
        const {error}=await sb.rpc("admin_update_student",{p_student_id:original,p_name:name,p_password:password||null});
        if(error) throw error;
      }else{
        const {error}=await sb.rpc("admin_create_student",{p_student_id:id,p_name:name,p_password:password});
        if(error) throw error;
      }
      closeDialog(); message("Student saved successfully.","success"); await Promise.all([loadStudents(),loadAttendance()]);
    }catch(err){ console.error(err); fm.textContent=err.message.includes("duplicate")?"That Student ID already exists.":(err.message||"Could not save student."); fm.className="message error";
    }finally{save.disabled=false;save.textContent="Save student";}
  }

  async function deleteStudent(id){
    if(!confirm(`Delete ${id}? This will also remove that student's attendance records.`)) return;
    const {error}=await sb.rpc("admin_delete_student",{p_student_id:id});
    if(error){ console.error(error); return message(error.message||"Could not delete student.","error"); }
    message("Student deleted.","success"); await Promise.all([loadStudents(),loadAttendance()]);
  }
  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));}
  boot();
})();
