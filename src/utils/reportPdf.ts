type ReportSection = {
  heading: string;
  lines: string[];
};

type ReportPayload = {
  title: string;
  subtitle: string;
  sections: ReportSection[];
  footer: string;
};

type FontKey = "regular" | "bold" | "italic";

function escapePdfText(input: string) {
  return input.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text: string, maxChars: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }

    if (current) {
      lines.push(current);
    }
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function splitLabelValue(input: string) {
  const separatorIndex = input.indexOf(": ");
  if (separatorIndex === -1) {
    return null;
  }

  return {
    label: input.slice(0, separatorIndex + 1),
    value: input.slice(separatorIndex + 2),
  };
}

function measureSectionHeight(section: ReportSection) {
  let lineUnits = 0;

  for (const rawLine of section.lines) {
    const pair = splitLabelValue(rawLine);
    if (pair) {
      const wrappedValue = wrapText(pair.value, 58);
      lineUnits += Math.max(wrappedValue.length, 1);
      continue;
    }

    lineUnits += Math.max(wrapText(rawLine, 76).length, 1);
  }

  return {
    height: 54 + lineUnits * 17,
    lineUnits,
  };
}

export function buildPdfReport(payload: ReportPayload) {
  const commands: string[] = [];
  let y = 792;

  function addCommand(command: string) {
    commands.push(command);
  }

  function setFillColor(r: number, g: number, b: number) {
    addCommand(`${r} ${g} ${b} rg`);
  }

  function setStrokeColor(r: number, g: number, b: number) {
    addCommand(`${r} ${g} ${b} RG`);
  }

  function drawFilledRect(x: number, top: number, width: number, height: number) {
    const bottom = top - height;
    addCommand(`${x} ${bottom} ${width} ${height} re f`);
  }

  function drawLine(x1: number, y1: number, x2: number, y2: number) {
    addCommand(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  function addText(text: string, x: number, baselineY: number, size: number, font: FontKey) {
    const fontRef = font === "bold" ? "F2" : font === "italic" ? "F3" : "F1";
    addCommand(
      `BT /${fontRef} ${size} Tf 1 0 0 1 ${x} ${baselineY} Tm (${escapePdfText(text)}) Tj ET`,
    );
  }

  setFillColor(0.95, 0.96, 0.98);
  drawFilledRect(0, 792, 612, 792);

  setFillColor(0.09, 0.13, 0.24);
  drawFilledRect(0, 792, 612, 96);

  setFillColor(1, 1, 1);
  addText(payload.title, 54, 742, 22, "bold");
  addText(payload.subtitle, 54, 718, 11, "italic");
  addText("Mariana Minerals Take-Home", 54, 774, 9, "regular");

  y = 664;

  for (const section of payload.sections) {
    const { height } = measureSectionHeight(section);
    setFillColor(1, 1, 1);
    drawFilledRect(42, y + 18, 528, height);

    setStrokeColor(0.86, 0.89, 0.94);
    drawLine(42, y + 18, 570, y + 18);

    setFillColor(0.11, 0.18, 0.32);
    addText(section.heading, 58, y, 13, "bold");
    y -= 24;

    for (const rawLine of section.lines) {
      const pair = splitLabelValue(rawLine);

      if (pair) {
        const wrappedValue = wrapText(pair.value, 58);
        addText(pair.label, 58, y, 10.5, "bold");
        addText(wrappedValue[0] ?? "", 138, y, 10.5, "regular");
        y -= 17;

        for (const continuation of wrappedValue.slice(1)) {
          addText(continuation, 138, y, 10.5, "regular");
          y -= 17;
        }
      } else {
        for (const line of wrapText(rawLine, 76)) {
          addText(line, 58, y, 10.5, "regular");
          y -= 17;
        }
      }
    }

    y -= 20;
  }

  setStrokeColor(0.82, 0.85, 0.9);
  drawLine(54, 64, 558, 64);
  setFillColor(0.39, 0.45, 0.56);
  addText(payload.footer, 54, 44, 9, "regular");

  const contentStream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 7 0 R >> >> >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  objects.forEach((objectBody, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objectBody}\nendobj\n`;
  });

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
}
