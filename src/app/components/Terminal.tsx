import { useState, useRef, useEffect } from 'react';
import { Terminal as TerminalIcon } from 'lucide-react';

interface OutputLine {
  type: 'command' | 'output' | 'error';
  content: string | JSX.Element;
}

const portfolioData = {
  name: "Tayo Ogunbiyi",
  title: "AI Builder",
  email: "eyitayoogunbiyi@gmail.com",
  github: "github.com/togunbiyi",
  linkedin: "linkedin.com/in/eyitayo",

  about: `AI builder, currently at Meta. Exploring technology at the intersection of dev tools and AI —
rethinking how AI helps humans be more productive and capable.
Based in London, UK. Care about performance and clean, elegant software.`,

  projects: [
    {
      name: "htop_mini",
      description: "A minimal htop clone built in Rust",
      tech: "Rust",
      link: "github.com/tayoogunbiyi/htop_mini"
    }
  ],

  skills: {
    "Frontend": ["React", "JavaScript"],
    "Backend": ["Python", "Golang", "PHP", "Rust", "English (the hottest new language)"],
  },

  experience: [
    {
      company: "Meta",
      position: "Software Engineer",
      period: "2024 - Present",
      description: ""
    },
    {
      company: "Quora",
      position: "Software Engineer",
      period: "2021 - 2024",
      description: ""
    }
  ],

  education: [
    {
      degree: "Computer Engineering",
      school: "University of Lagos",
      year: "2021"
    }
  ]
};

const commands = {
  help: "Display available commands",
  about: "Learn more about me",
  projects: "View my projects",
  skills: "See my technical skills",
  experience: "View my work experience",
  education: "View my education",
  contact: "Get my contact information",
  clear: "Clear the terminal",
  echo: "Echo a message"
};

const getBanner = () => {
  return [
    `Welcome to ${portfolioData.name}'s Portfolio Terminal`,
    portfolioData.title,
    ``,
    `Type 'help' to see available commands`,
    `Type 'about' to learn more about me`,
  ].join('\n');
};

export function Terminal() {
  const [history, setHistory] = useState<OutputLine[]>([
    { type: 'output', content: getBanner() }
  ]);
  const [input, setInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [history]);

  const processCommand = (cmd: string) => {
    const trimmedCmd = cmd.trim();
    const [command, ...args] = trimmedCmd.split(' ');
    const lowerCommand = command.toLowerCase();

    const newHistory: OutputLine[] = [
      { type: 'command', content: `$ ${trimmedCmd}` }
    ];

    if (!trimmedCmd) {
      setHistory([...history, ...newHistory]);
      return;
    }

    switch (lowerCommand) {
      case 'help':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="mb-2">Available commands:</div>
              {Object.entries(commands).map(([cmd, desc]) => (
                <div key={cmd} className="ml-4 mb-1">
                  <span className="text-green-400">{cmd.padEnd(15)}</span>
                  <span className="text-gray-400">- {desc}</span>
                </div>
              ))}
            </div>
          )
        });
        break;

      case 'about':
        newHistory.push({
          type: 'output',
          content: (
            <div className="whitespace-pre-wrap">
              <div className="text-cyan-400 text-lg mb-2">About Me</div>
              <div>{portfolioData.about}</div>
            </div>
          )
        });
        break;

      case 'projects':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="text-cyan-400 text-lg mb-3">My Projects</div>
              {portfolioData.projects.map((project, idx) => (
                <div key={idx} className="mb-4 ml-2">
                  <div className="text-green-400">[{idx + 1}] {project.name}</div>
                  <div className="ml-4 text-gray-300">{project.description}</div>
                  <div className="ml-4 text-yellow-400">Tech: {project.tech}</div>
                  <div className="ml-4 text-blue-400">→ {project.link}</div>
                </div>
              ))}
            </div>
          )
        });
        break;

      case 'skills':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="text-cyan-400 text-lg mb-3">Technical Skills</div>
              {Object.entries(portfolioData.skills).map(([category, skillList]) => (
                <div key={category} className="mb-3">
                  <div className="text-green-400">{category}:</div>
                  <div className="ml-4 text-gray-300">{skillList.join(' • ')}</div>
                </div>
              ))}
            </div>
          )
        });
        break;

      case 'experience':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="text-cyan-400 text-lg mb-3">Work Experience</div>
              {portfolioData.experience.map((exp, idx) => (
                <div key={idx} className="mb-4 ml-2">
                  <div className="text-green-400">{exp.position} @ {exp.company}</div>
                  <div className="ml-4 text-yellow-400">{exp.period}</div>
                  <div className="ml-4 text-gray-300">{exp.description}</div>
                </div>
              ))}
            </div>
          )
        });
        break;

      case 'education':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="text-cyan-400 text-lg mb-3">Education</div>
              {portfolioData.education.map((edu, idx) => (
                <div key={idx} className="mb-3 ml-2">
                  <div className="text-green-400">{edu.degree}</div>
                  <div className="ml-4 text-gray-300">{edu.school} • {edu.year}</div>
                </div>
              ))}
            </div>
          )
        });
        break;

      case 'contact':
        newHistory.push({
          type: 'output',
          content: (
            <div>
              <div className="text-cyan-400 text-lg mb-3">Contact Information</div>
              <div className="ml-2">
                <div className="mb-2">
                  <span className="text-green-400">GitHub:</span>
                  <span className="ml-4 text-blue-400">{portfolioData.github}</span>
                </div>
                <div className="mb-2">
                  <span className="text-green-400">LinkedIn:</span>
                  <span className="ml-4 text-blue-400">{portfolioData.linkedin}</span>
                </div>
              </div>
            </div>
          )
        });
        break;

      case 'clear':
        setHistory([]);
        return;

      case 'echo':
        newHistory.push({
          type: 'output',
          content: args.join(' ')
        });
        break;

      default:
        newHistory.push({
          type: 'error',
          content: `Command not found: ${command}. Type 'help' for available commands.`
        });
    }

    setHistory([...history, ...newHistory]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setCommandHistory([...commandHistory, input]);
    setHistoryIndex(-1);
    processCommand(input);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex === -1
          ? commandHistory.length - 1
          : Math.max(0, historyIndex - 1);
        setHistoryIndex(newIndex);
        setInput(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const newIndex = historyIndex + 1;
        if (newIndex >= commandHistory.length) {
          setHistoryIndex(-1);
          setInput('');
        } else {
          setHistoryIndex(newIndex);
          setInput(commandHistory[newIndex]);
        }
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const matchingCommands = Object.keys(commands).filter(cmd =>
        cmd.startsWith(input.toLowerCase())
      );
      if (matchingCommands.length === 1) {
        setInput(matchingCommands[0]);
      } else if (matchingCommands.length > 1) {
        const newHistory: OutputLine[] = [
          { type: 'command', content: `$ ${input}` },
          {
            type: 'output',
            content: matchingCommands.join('  ')
          }
        ];
        setHistory([...history, ...newHistory]);
      }
    }
  };

  const handleTerminalClick = () => {
    inputRef.current?.focus();
  };

  return (
    <div className="h-screen bg-gray-900 text-gray-100 font-mono p-4 overflow-hidden">
      <div className="max-w-5xl mx-auto h-full flex flex-col overflow-hidden">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-700 flex-shrink-0">
          <TerminalIcon className="w-5 h-5 text-green-400" />
          <span className="text-green-400">terminal</span>
          <span className="text-gray-500">~/portfolio</span>
          <div className="ml-auto flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
        </div>

        {/* Terminal Content */}
        <div
          ref={terminalRef}
          className="flex-1 overflow-y-auto mb-4 cursor-text min-h-0"
          onClick={handleTerminalClick}
        >
          {history.map((line, idx) => (
            <div key={idx} className="mb-2">
              {line.type === 'command' ? (
                <div className="text-green-400">{line.content}</div>
              ) : line.type === 'error' ? (
                <div className="text-red-400">{line.content}</div>
              ) : (
                <div className={`text-gray-300${typeof line.content === 'string' ? ' whitespace-pre' : ''}`}>{line.content}</div>
              )}
            </div>
          ))}
        </div>

        {/* Terminal Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-shrink-0">
          <span className="text-green-400">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none outline-none text-gray-100 font-mono"
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
          <span className="animate-pulse text-green-400">▊</span>
        </form>

        {/* Hint */}
        <div className="mt-2 text-xs text-gray-600 flex-shrink-0">
          Tip: Use ↑/↓ arrow keys for command history, Tab for autocomplete
        </div>
      </div>
    </div>
  );
}
