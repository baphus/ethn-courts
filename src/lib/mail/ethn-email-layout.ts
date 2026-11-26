export function renderEthnEmailHtml(email: {
  title: string;
  preheader: string;
  status: string;
  audience: string;
  sections: { title: string; lines: string[] }[];
  action: { label: string; href: string };
  links: { label: string; href: string }[];
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
  const lineStyle = "margin:0 0 10px;color:#314d5c;font-size:15px;line-height:1.65;overflow-wrap:anywhere;word-break:break-word;";
  const sections = email.sections.map((section) => `
    <tr><td style="padding:20px 0 0;">
      <h2 style="margin:0 0 10px;color:#17252e;font-size:16px;line-height:1.4;">${text(section.title)}</h2>
      ${section.lines.map((line) => `<p style="${lineStyle}">${text(line).replace(/\r\n?|\n/g, "<br>")}</p>`).join("")}
    </td></tr>`).join("");
  const links = email.links.map((link) => `<a href="${escape(link.href)}" style="color:#447244;text-decoration:underline;overflow-wrap:anywhere;">${text(link.label)}</a>`).join(" &nbsp;·&nbsp; ");
  const footer = email.footer.map((line) => `<p style="margin:0 0 6px;color:#6c7c84;font-size:12px;line-height:1.6;overflow-wrap:anywhere;">${text(line)}</p>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${text(email.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f6f8f8;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${text(email.preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f8f8;"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border:1px solid #dce5e8;">
<tr><td style="padding:24px 28px;background-color:#314d5c;border-bottom:4px solid #f28500;">
<p style="margin:0 0 8px;color:#eaf0f3;font-size:12px;line-height:1.4;letter-spacing:1.4px;text-transform:uppercase;">ETHN COURTS</p>
<h1 style="margin:0;color:#ffffff;font-size:25px;line-height:1.25;">${text(email.title)}</h1>
</td></tr>
<tr><td style="padding:26px 28px 30px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding:7px 11px;background-color:#fff0dc;color:#17252e;font-size:12px;font-weight:bold;line-height:1.3;">${text(email.status)}</td><td style="padding-left:10px;color:#6c7c84;font-size:12px;line-height:1.4;">${text(email.audience)}</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sections}</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;"><tr><td bgcolor="#f28500" style="background-color:#f28500;"><a href="${escape(email.action.href)}" style="display:inline-block;padding:13px 20px;color:#17252e;font-size:15px;font-weight:bold;line-height:1.3;text-decoration:none;">${text(email.action.label)}</a></td></tr></table>
${email.links.length ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.6;">${links}</p>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:1px solid #dce5e8;"><tr><td style="padding-top:16px;">${footer}</td></tr></table>
</td></tr></table>
</td></tr></table>
</body>
</html>`;
}
