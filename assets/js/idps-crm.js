/**
 * IDPS Borivali ↔ Sensora CRM integration
 * Handles:
 * - Lead/Enquiry capture with UTM tracking & honeypots
 * - Admission application status lookup
 * - WhatsApp & Call beacon tracking
 * - Dynamic CRM content rendering (courses, fees, news)
 */
(function(){
  var API = "https://api.idpsborivali.com/api/method/crm.api.website.";
  var SITE_KEY = "9d4cefd696f9ef6fd6aacbc08e6bee33"; // public key — rotate in CRM > Website Content if it ever leaks

  function captureUtm(){
    var p = new URLSearchParams(location.search), out = {};
    ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid"].forEach(function(k){
      var v = p.get(k); if (v) out[k] = v;
    });
    out.referrer = document.referrer || "";
    if (!sessionStorage.getItem("idps_lp")) sessionStorage.setItem("idps_lp", location.pathname);
    out.landing_page = sessionStorage.getItem("idps_lp"); out.page = location.pathname;
    return out;
  }

  function post(path, body, done){
    fetch(API + path, {method:"POST", credentials:"omit",
      headers:{"Content-Type":"application/json"}, body:JSON.stringify(body)})
    .then(function(r){return r.json();}).then(function(json){
      done(json && json.message ? json.message : json);
    }).catch(function(){done({status:"error",message:"Network error — please call +91 77381 96931."});});
  }

  function show(form, msg, ok){
    var box = form.querySelector(".idps-result");
    if (!box){
      box = document.createElement("div");
      box.className = "idps-result";
      box.style.cssText = "margin-top:10px;padding:12px;border-radius:6px;font-size:14px;text-align:center;font-weight:600;";
      form.appendChild(box);
    }
    box.style.display = "block";
    box.textContent = msg;
    box.style.background = ok ? "#d1fae5" : "#fee2e2";
    box.style.color = ok ? "#065f46" : "#991b1b";
    box.style.border = "1px solid " + (ok ? "#86efac" : "#fca5a5");
    setTimeout(function(){box.style.display="none";}, 7000);
  }

  function bindForm(form, section){
    if (!form || form.dataset.idpsCrmBound) return;
    form.dataset.idpsCrmBound = 1;

    // Honeypot fields for anti-spam
    var hp1 = document.createElement("input"); hp1.name = "hp_website"; hp1.type = "text";
    var hp2 = document.createElement("input"); hp2.name = "hp_fax"; hp2.type = "text";
    [hp1,hp2].forEach(function(h){h.style.display="none";h.tabIndex="-1";h.autocomplete="off";form.appendChild(h);});

    form.onsubmit = function(e){
      e.preventDefault();
      var fd = new FormData(form), data = {site_key:SITE_KEY};
      fd.forEach(function(v,k){if (k && !k.startsWith("hp_")) data[k] = v;});
      Object.assign(data, captureUtm());
      if (!data.parent_name && data["Your Name"]) data.parent_name = data["Your Name"];
      if (!data.student_name && data["Student's Name & Age"]) data.student_name = data["Student's Name & Age"];
      if (!data.mobile_no && data["Contact Mobile Number"]) data.mobile_no = data["Contact Mobile Number"];
      if (!data.mobile_no && data["Phone Number"]) data.mobile_no = data["Phone Number"];
      if (!data.email && data["Email Address"]) data.email = data["Email Address"];
      if (!data.grade_applying_for && data["Select Grade Seeking Admission (Nursery to 7th Standard) *"]) data.grade_applying_for = data["Select Grade Seeking Admission (Nursery to 7th Standard) *"];
      if (!data.notes && data.message) data.notes = data.message;
      data.page = section;
      data.landing_page = location.pathname;

      post("submit_enquiry", data, function(m){
        if (m.status === "success"){
          show(form, "Thank you! Application reference " + m.reference + " — we'll call you within 24 hours.", true);
          form.reset();
        } else {
          show(form, m.message || "Couldn't submit — please call +91 77381 96931.", false);
        }
      });
    };
  }

  // Bind forms across site
  bindForm(document.querySelector("#admissions-form-section form") || document.querySelector("#admissionFormSection form"), "admissions");
  bindForm(document.getElementById("contactForm"), "contact");
  bindForm(document.getElementById("homeEnquiryForm") || document.querySelector("#intro-enquiry-form") || document.querySelector("form[action*='contact']"), "home");

  // status lookup widget
  var refEl = document.getElementById("idps-status-ref"), btn = document.getElementById("idps-status-btn");
  if (refEl && btn){
    btn.onclick = function(){
      var msgEl = document.getElementById("idps-status-msg");
      var phoneEl = document.getElementById("idps-status-phone");
      var refVal = refEl.value.trim();
      var phoneVal = phoneEl ? phoneEl.value.trim() : "";
      if (!refVal){
        if (msgEl){ msgEl.textContent = "Please enter your Application reference number."; msgEl.style.color = "#991b1b"; }
        return;
      }
      post("admission_status", {ref: refVal, phone: phoneVal}, function(m){
        if (m.status === "ok"){
          msgEl.innerHTML = "<strong>Stage:</strong> " + m.stage + "<br>" + m.guidance +
            (m.grade ? "<br>Grade: " + m.grade + " · AY " + m.academic_year : "") +
            "<br>Updated: " + (m.updated||"").slice(0,10);
          msgEl.style.color = "#065f46";
        } else { msgEl.textContent = m.message || "No match."; msgEl.style.color = "#991b1b"; }
      });
    };
  }

  // WhatsApp / call click beacons
  document.addEventListener("click", function(e){
    var a = e.target.closest("a");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/wa\.me/i.test(href) || a.classList.contains("idps-btn-wa")){
      post("track_event", {event:"whatsapp_click", page:location.pathname, ref:"", session_id:"web-"+Date.now()}, function(){});
    } else if (/^tel:/i.test(href)){
      post("track_event", {event:"call_click", page:location.pathname, ref:"", session_id:"web-"+Date.now()}, function(){});
    }
  });

  // two-way content: render where placeholders exist
  fetch(API + "site_content", {credentials:"omit"}).then(function(r){return r.json();}).then(function(json){
    var c = json && json.message ? json.message : {};
    function render(id, key, tmpl){
      var el = document.getElementById(id); if (!el || !c[key]) return;
      el.innerHTML = c[key].map(function(r,i){return tmpl(r,i);}).join("");
    }
    render("idps-courses","courses", function(r){
      return "<div style='border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px;'><strong style='color:#0284c7;'>" + (r.title||"") + "</strong> — " + (r.grades||"") + (r.summary ? "<br><small style='color:#64748b;'>" + r.summary + "</small>" : "") + "</div>";
    });
    render("idps-fees","fees", function(r){
      return "<div style='border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px;'><strong>" + (r.grade||"") + "</strong> · Admission ₹" + (r.admission_fee||0) + " · Tuition ₹" + (r.tuition_fee||0) + "/" + (r.frequency||"year") + (r.note ? " <small style='color:#64748b;'>(" + r.note + ")</small>" : "") + "</div>";
    });
    render("idps-news","news", function(r,i){
      return i < 3 ? "<div style='margin-bottom:10px;'><strong>" + (r.headline||"") + "</strong><br><small style='color:#64748b;'>" + (r.body||"") + "</small></div>" : "";
    });
  }).catch(function(){});
})();
