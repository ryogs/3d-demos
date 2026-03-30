/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const lastPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    const vsSource = `
      attribute vec4 aVertexPosition;
      void main() {
        gl_Position = aVertexPosition;
      }
    `;

    const fsSource = `
      precision highp float;
      uniform float u_time;
      uniform vec2 u_resolution;
      uniform vec2 u_rotation;
      uniform vec2 u_mouse;

      #define MAX_STEPS 120
      #define SURF_DIST 0.001
      #define MAX_DIST 10.0

      mat2 rot(float a) {
        float s = sin(a), c = cos(a);
        return mat2(c, -s, s, c);
      }

      float hash(vec3 p) {
        p = fract(p * vec3(123.34, 456.21, 789.18));
        p += dot(p, p.yzx + 19.19);
        return fract((p.x + p.y) * p.z);
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
                       mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
                       mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.2;
          a *= 0.5;
        }
        return v;
      }

      float map(vec3 p) {
        // Apply user rotation + subtle auto-rotation + mouse influence
        p.yz *= rot(u_rotation.y + u_mouse.y * 0.2);
        p.xz *= rot(u_rotation.x + u_time * 0.1 + u_mouse.x * 0.2);
        
        float sphere = length(p) - 1.0;
        
        // Rugged rocky texture using FBM
        float d = fbm(p * 1.2 + u_time * 0.02) * 0.3;
        d += fbm(p * 4.0) * 0.05;
        
        // Craters: Using a combination of noise and smoothstep to create circular depressions
        for(float i=1.0; i<=3.0; i++) {
            vec3 craterPos = p * (i * 1.5);
            float n = noise(craterPos + i * 10.0);
            float crater = smoothstep(0.4, 0.5, n) * smoothstep(0.6, 0.5, n);
            d -= crater * 0.08 * (1.0/i);
        }
        
        // Micro-craggy details
        d += noise(p * 20.0) * 0.01;
        
        return sphere - d;
      }

      vec3 getNormal(vec3 p) {
        vec2 e = vec2(0.003, 0.0);
        return normalize(vec3(
          map(p + e.xyy) - map(p - e.xyy),
          map(p + e.yxy) - map(p - e.yxy),
          map(p + e.yyx) - map(p - e.yyx)
        ));
      }

      void main() {
        vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / u_resolution.y;
        vec3 ro = vec3(0.0, 0.0, -2.8);
        vec3 rd = normalize(vec3(uv, 1.3));

        float t = 0.0;
        bool hit = false;
        for (int i = 0; i < MAX_STEPS; i++) {
          vec3 p = ro + rd * t;
          float d = map(p);
          if (d < SURF_DIST) {
            hit = true;
            break;
          }
          if (t > MAX_DIST) break;
          t += d;
        }

        // Deep space background
        vec3 color = vec3(0.0);
        color += (1.0 - length(uv)) * 0.015;

        if (hit) {
          vec3 p = ro + rd * t;
          vec3 n = getNormal(p);
          vec3 lightDir = normalize(vec3(4.0, 5.0, -4.0));
          vec3 viewDir = normalize(ro - p);
          vec3 reflectDir = reflect(-lightDir, n);
          
          // Metallic PBR-lite components
          float diff = max(dot(n, lightDir), 0.0);
          float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
          float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 5.0);
          
          // Base metallic moon rock color: Dark basalt with silver mineral veins
          vec3 baseColor = mix(vec3(0.05, 0.05, 0.06), vec3(0.2, 0.22, 0.25), fbm(p * 2.0));
          
          // Mineral reflection (metallic sheen)
          vec3 refCol = mix(vec3(0.3, 0.35, 0.4), vec3(0.9, 0.95, 1.0), fbm(reflectDir * 1.5 + u_time * 0.05));
          refCol *= 1.4;
          
          // Combine lighting
          color = mix(baseColor * (diff + 0.05), refCol, fresnel * 0.6 + 0.1);
          color += spec * vec3(0.8, 0.9, 1.0) * 1.2;
          
          // Rim lighting (lunar glow)
          float rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
          color += vec3(0.5, 0.7, 1.0) * rim * 0.4;
          
          // Heavy ambient occlusion for rocky crevices
          float ao = clamp(map(p + n * 0.1) / 0.1, 0.0, 1.0);
          color *= mix(0.1, 1.0, ao);
          
          // Add "lunar dust" sparkles
          float sparkles = pow(hash(p * 50.0), 50.0);
          color += sparkles * vec3(1.0) * diff;
        }

        // Gamma correction
        color = pow(color, vec3(0.4545));
        gl_FragColor = vec4(color, 1.0);
      }
    `;

    function createShader(gl: WebGLRenderingContext, type: number, source: string) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vs || !fs) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positions = new Float32Array([-1, 1, 1, 1, -1, -1, 1, -1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posAttrib = gl.getAttribLocation(program, 'aVertexPosition');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const rotLoc = gl.getUniformLocation(program, 'u_rotation');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    let animationFrameId: number;
    const render = (time: number) => {
      gl.uniform1f(timeLoc, time * 0.001);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform2f(rotLoc, (window as any)._rotX || 0, (window as any)._rotY || 0);
      gl.uniform2f(mouseLoc, (window as any)._mouseX || 0, (window as any)._mouseY || 0);

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationFrameId = requestAnimationFrame(render);
    };
    animationFrameId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const handleStart = (x: number, y: number) => {
    setIsInteracting(true);
    lastPos.current = { x, y };
  };

  const handleMove = (x: number, y: number) => {
    // Update mouse position for hover influence
    const nx = (x / window.innerWidth) * 2 - 1;
    const ny = (y / window.innerHeight) * 2 - 1;
    setMousePos({ x: nx, y: ny });
    (window as any)._mouseX = nx;
    (window as any)._mouseY = ny;

    if (!isInteracting) return;
    const dx = x - lastPos.current.x;
    const dy = y - lastPos.current.y;
    
    setRotation(prev => {
      const next = { x: prev.x + dx * 0.01, y: prev.y + dy * 0.01 };
      (window as any)._rotX = next.x;
      (window as any)._rotY = next.y;
      return next;
    });
    
    lastPos.current = { x, y };
  };

  const handleEnd = () => {
    setIsInteracting(false);
  };

  return (
    <div 
      className="fixed inset-0 bg-black overflow-hidden cursor-crosshair"
      onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
      onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
      onTouchEnd={handleEnd}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      
      <div className="absolute top-8 left-8 text-white/20 font-mono text-[9px] tracking-[0.3em] uppercase pointer-events-none">
        Lunar Artifact // 002 // Metallic Moon Rock
      </div>
      
      <div className="absolute bottom-8 right-8 text-white/20 font-mono text-[9px] tracking-[0.3em] uppercase pointer-events-none">
        Hover to Influence // Drag to Rotate
      </div>
    </div>
  );
}


