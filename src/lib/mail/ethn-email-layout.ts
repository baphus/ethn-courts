export function renderEthnEmailHtml(email: {
  title: string;
  preheader: string;
  status: string;
  audience: string;
  sections: { title: string; lines: string[] }[];
  action: { label: string; href: string };
  links: { label: string; href: string }[];
  logoCid?: string;
  trackingQrCid?: string;
  footer: string[];
}): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
  const text = (value: string) => escape(value);
  const lineStyle = "margin:0 0 10px;color:#314d5c;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;text-align:center;";
  const sections = email.sections.map((section) => `
    <tr><td align="center" style="padding:20px 12px 0;text-align:center;">
      <h2 style="margin:0 0 10px;color:#17252e;font-size:16px;line-height:1.4;text-align:center;">${text(section.title)}</h2>
      ${section.lines.map((line) => `<p style="${lineStyle}">${text(line).replace(/\r\n?|\n/g, "<br>")}</p>`).join("")}
    </td></tr>`).join("");
  const links = email.links.map((link) => `<a href="${escape(link.href)}" style="color:#447244;text-decoration:underline;overflow-wrap:anywhere;">${text(link.label)}</a>`).join(" &nbsp;·&nbsp; ");
  const footer = email.footer.map((line) => `<p style="margin:0 0 6px;color:#596b75;font-size:12px;line-height:1.6;overflow-wrap:anywhere;text-align:center;">${text(line)}</p>`).join("");
  const trackingQr = email.trackingQrCid ? `<tr><td align="center" style="padding-top:22px;text-align:center;"><p style="margin:0 0 10px;color:#314d5c;font-size:14px;font-weight:bold;line-height:1.5;">Private status — do not share; not for check-in</p><img src="cid:${escape(email.trackingQrCid)}" width="144" height="144" alt="Private booking status QR code" style="display:block;width:144px;height:144px;max-width:100%;margin:0 auto;border:1px solid #dce5e8;"></td></tr>` : "";
  const brand = email.logoCid ? `<img src="cid:${escape(email.logoCid)}" width="220" alt="ETHN Courts" style="display:block;width:220px;max-width:100%;height:auto;margin:0 auto 14px;">` : `<p style="margin:0 0 14px;color:#ffffff;font-size:18px;font-weight:bold;line-height:1.3;text-align:center;">ETHN Courts</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${text(email.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f6fa;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${text(email.preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f6fa;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #d9e1ec;">
<tr><td align="center" style="padding:24px 22px 22px;background-color:#00288e;border-bottom:4px solid #65a30d;text-align:center;">
${brand}
<p style="margin:0 0 10px;color:#eaf0ff;font-size:12px;font-weight:bold;line-height:1.4;letter-spacing:1.5px;">ETHN COURTS</p>
<h1 style="margin:0;color:#ffffff;font-size:25px;line-height:1.25;text-align:center;">${text(email.title)}</h1>
</td></tr>
<tr><td align="center" style="padding:24px 20px 28px;text-align:center;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td align="center" style="padding:7px 11px;background-color:#eaf0ff;color:#00288e;font-size:12px;font-weight:bold;line-height:1.3;text-align:center;">${text(email.status)}</td><td align="center" style="padding-left:10px;color:#596b75;font-size:12px;line-height:1.4;text-align:center;">${text(email.audience)}</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #d9e1ec;">${sections}</table>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr><td align="center" bgcolor="#00288e" style="background-color:#00288e;border-radius:4px;"><a href="${escape(email.action.href)}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:15px;font-weight:bold;line-height:1.3;text-decoration:none;">${text(email.action.label)}</a></td></tr></table>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:0 auto;">${trackingQr}</table>
${email.links.length ? `<p style="margin:22px 0 0;color:#314d5c;font-size:13px;line-height:1.6;text-align:center;">${links}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #d9e1ec;"><tr><td align="center" style="padding:16px 12px 0;text-align:center;">${footer}</td></tr></table>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
}
