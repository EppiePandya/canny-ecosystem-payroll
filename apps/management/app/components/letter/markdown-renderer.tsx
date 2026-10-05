import { formatDateToSlash } from "@canny_ecosystem/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import React from "react";
import type { LetterBaseDataType } from "@canny_ecosystem/supabase/letter";
import { CANNY_MANAGEMENT_SERVICES_NAME } from "@/constant";
import { SUPABASE_LETTER_COMPONENTS_URL_PREFIX } from "@canny_ecosystem/utils/constant";
import { Signature } from "./letter-templates/signature";

const extractTextContent = (children: any): string => {
  let text = "";
  React.Children.forEach(children, (child) => {
    if (typeof child === "string") {
      text += child;
    } else if (React.isValidElement(child) && (child.props as any).children) {
      text += extractTextContent((child.props as any).children);
    }
  });
  return text;
};

const cleanCenterFromChildren = (nodes: any): any => {
  return React.Children.map(nodes, (child) => {
    if (typeof child === "string") {
      return child.replace(/\$\{center\}/g, "");
    }
    if (React.isValidElement(child) && (child.props as any).children) {
      return React.cloneElement(child, {
        ...(child.props as any),
        children: cleanCenterFromChildren((child.props as any).children),
      });
    }
    return child;
  });
};

const renderParagraphContent = (
  children: any,
  data?: LetterBaseDataType | null,
): any => {
  const flattenedText = extractTextContent(children);
  const hasSalaryStructure = flattenedText.includes("${salaryStructure}");
  const hasSignature = /\$\{signature((?::[0-2])*)?\}/.test(flattenedText);
  const hasEmployeeSignatureWithName = flattenedText.includes(
    "${employeeSignatureWithName}",
  );
  const hasEmployeeSignatureWithLetterName = flattenedText.includes(
    "${employeeSignatureWithLetterName}",
  );
  const hasEmployeeSignature = flattenedText.includes("${employeeSignature}");

  if (
    hasSalaryStructure ||
    hasSignature ||
    hasEmployeeSignatureWithName ||
    hasEmployeeSignatureWithLetterName ||
    hasEmployeeSignature
  ) {
    let textToProcess = flattenedText;
    let isCentered = false;

    if (textToProcess.includes("${center}")) {
      isCentered = true;
      textToProcess = textToProcess.replace("${center}", "");
    }

    const placeholders = [
      { token: "${salaryStructure}", type: "salaryStructure" },
      {
        token: "${employeeSignatureWithName}",
        type: "employeeSignatureWithName",
      },
      {
        token: "${employeeSignatureWithLetterName}",
        type: "employeeSignatureWithLetterName",
      },
      { token: "${employeeSignature}", type: "employeeSignature" },
    ];

    let nodes: any[] = [{ type: "text", content: textToProcess }];

    for (const ph of placeholders) {
      const nextNodes: any[] = [];
      for (const node of nodes) {
        if (node.type === "text" && node.content.includes(ph.token)) {
          const split = node.content.split(ph.token);
          for (const [i, sp] of split.entries()) {
            if (sp) nextNodes.push({ type: "text", content: sp });
            if (i < split.length - 1) {
              nextNodes.push({ type: ph.type });
            }
          }
        } else {
          nextNodes.push(node);
        }
      }
      nodes = nextNodes;
    }

    if (hasSignature) {
      const nextNodes: any[] = [];
      const sigRegex = /\$\{signature((?::[0-2])*)?\}/g;
      for (const node of nodes) {
        if (node.type === "text") {
          let lastIdx = 0;
          sigRegex.lastIndex = 0;

          while (true) {
            const match = sigRegex.exec(node.content);
            if (match === null) break;

            const before = node.content.slice(lastIdx, match.index);
            if (before) nextNodes.push({ type: "text", content: before });

            const suffix = match[1] || "";
            nextNodes.push({ type: "signature", suffix });

            lastIdx = sigRegex.lastIndex;
          }

          const after = node.content.slice(lastIdx);
          if (after) nextNodes.push({ type: "text", content: after });
        } else {
          nextNodes.push(node);
        }
      }
      nodes = nextNodes;
    }

    return (
      <div className={`my-2 ${isCentered ? "text-center" : ""}`}>
        {nodes
          .filter(
            (node) =>
              node.type !== "signature" &&
              node.type !== "employeeSignatureWithName" &&
              node.type !== "employeeSignature" &&
              node.type !== "employeeSignatureWithLetterName",
          )
          .map((node, i) => {
            if (node.type === "text") {
              return <span key={i}>{node.content}</span>;
            }
            if (node.type === "salaryStructure") {
              return null;
            }
            return null;
          })}

        {(() => {
          const sigNodes = nodes.filter(
            (node) =>
              node.type === "signature" ||
              node.type === "employeeSignatureWithName" ||
              node.type === "employeeSignature" ||
              node.type === "employeeSignatureWithLetterName",
          );
          if (sigNodes.length === 0) return null;

          return (
            <div className="flex justify-between items-end mt-8 pt-4">
              {sigNodes.map((node, i) => {
                if (node.type === "signature") {
                  return (
                    <div key={i} className="text-left relative">
                      <p className="font-bold text-xs">Yours truly,</p>
                      <p className="font-bold text-xs mb-1">
                        {CANNY_MANAGEMENT_SERVICES_NAME}
                      </p>
                      <div className="my-1">
                        <Signature
                          src={`${SUPABASE_LETTER_COMPONENTS_URL_PREFIX}/signature.png`}
                        />
                      </div>
                      <p className="text-xs">Director</p>
                    </div>
                  );
                }

                if (node.type === "employeeSignatureWithName") {
                  return (
                    <div key={i} className="text-left">
                      <p className="font-bold text-xs mb-6">
                        I accept the contract of employment with the terms and
                        conditions contained thereto
                      </p>
                      <p className="text-xs">_______________________________</p>
                      <p className="font-bold text-xs">
                        {[
                          data?.employees?.first_name,
                          data?.employees?.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                      <p className="text-xs">
                        Date: {formatDateToSlash(data?.date ?? new Date())}
                      </p>
                    </div>
                  );
                }

                if (node.type === "employeeSignatureWithLetterName") {
                  return (
                    <div key={i} className="text-left">
                      <p className="font-bold text-xs mb-6">
                        I accept the contract of employment with the terms and
                        conditions contained thereto
                      </p>
                      <p className="text-xs">_______________________________</p>
                      <p className="font-bold text-xs">
                        {data?.letter_name || ""}
                      </p>
                      <p className="text-xs">
                        Date: {formatDateToSlash(data?.date ?? new Date())}
                      </p>
                    </div>
                  );
                }

                if (node.type === "employeeSignature") {
                  return (
                    <div key={i} className="text-left">
                      <p className="font-bold text-xs mb-6">
                        I accept the contract of employment with the terms and
                        conditions contained thereto
                      </p>
                      <p className="text-xs">_______________________________</p>
                      <p className="text-xs">
                        Date: {formatDateToSlash(data?.date ?? new Date())}
                      </p>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          );
        })()}
      </div>
    );
  }

  const isCentered = flattenedText.includes("${center}");

  return (
    <p className={`my-1.5 leading-relaxed ${isCentered ? "text-center" : ""}`}>
      {isCentered ? cleanCenterFromChildren(children) : children}
    </p>
  );
};

export const MarkdownRenderer = ({
  content,
  data,
}: {
  content: string;
  data?: LetterBaseDataType | null;
}) => (
  <div className="prose max-w-none text-xs text-neutral-900 dark:text-neutral-100">
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-base font-bold my-2 text-center underline">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-sm font-bold my-1.5">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-xs font-bold my-1">{children}</h3>
        ),
        p: ({ children }) => renderParagraphContent(children, data),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
        ),
        li: ({ children }) => <li className="my-0.5">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-bold">{children}</strong>
        ),
        b: ({ children }) => <b className="font-bold">{children}</b>,
        em: ({ children }) => <em className="italic">{children}</em>,
        u: ({ children }) => <u className="underline">{children}</u>,
        table: ({ children }) => (
          <table className="w-full border-collapse border border-neutral-800 my-3 text-xs">
            {children}
          </table>
        ),
        thead: ({ children }) => (
          <thead className="bg-neutral-100 dark:bg-neutral-800">{children}</thead>
        ),
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => (
          <tr className="border-b border-neutral-300 dark:border-neutral-700">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="border border-neutral-300 dark:border-neutral-700 p-1.5 font-bold text-left">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-neutral-300 dark:border-neutral-700 p-1.5">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
);
