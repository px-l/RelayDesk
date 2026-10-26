import {defineConfig} from 'vite';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({base:'./',plugins:[tailwindcss()],server:{host:'127.0.0.1',port:5173,strictPort:true}});
