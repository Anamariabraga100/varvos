-- Permite upload anônimo na pasta motion-refs (Imitar Movimento)
-- Execute no Supabase: SQL Editor (Dashboard > SQL Editor > New Query)
--
-- ANTES DE EXECUTAR:
-- 1. Crie os buckets 'images' e 'videos' em Storage (Dashboard > Storage > New bucket)
-- 2. Marque-os como Public para getPublicUrl() funcionar
-- 3. Em images: limite 10MB, tipos image/jpeg, image/png (KIE não aceita WebP)
-- 4. Em videos: limite 100MB, tipos video/mp4, video/quicktime (MP4/MOV apenas; KIE não aceita MKV)

-- Políticas de INSERT para anon (upload sem login)
-- TO anon é obrigatório para permitir usuários não autenticados
DROP POLICY IF EXISTS "Allow public upload motion-refs images" ON storage.objects;
CREATE POLICY "Allow public upload motion-refs images" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'images' AND (storage.foldername(name))[1] = 'motion-refs'
  );

DROP POLICY IF EXISTS "Allow public upload motion-refs videos" ON storage.objects;
CREATE POLICY "Allow public upload motion-refs videos" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'videos' AND (storage.foldername(name))[1] = 'motion-refs'
  );

-- Políticas de SELECT para leitura pública (complementar)
DROP POLICY IF EXISTS "Allow public read motion-refs images" ON storage.objects;
CREATE POLICY "Allow public read motion-refs images" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'images' AND (storage.foldername(name))[1] = 'motion-refs');

DROP POLICY IF EXISTS "Allow public read motion-refs videos" ON storage.objects;
CREATE POLICY "Allow public read motion-refs videos" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = 'motion-refs');

-- Políticas de DELETE para limpeza após uso (app chama remove() ao terminar geração)
DROP POLICY IF EXISTS "Allow public delete motion-refs images" ON storage.objects;
CREATE POLICY "Allow public delete motion-refs images" ON storage.objects
  FOR DELETE TO anon
  USING (bucket_id = 'images' AND (storage.foldername(name))[1] = 'motion-refs');

DROP POLICY IF EXISTS "Allow public delete motion-refs videos" ON storage.objects;
CREATE POLICY "Allow public delete motion-refs videos" ON storage.objects
  FOR DELETE TO anon
  USING (bucket_id = 'videos' AND (storage.foldername(name))[1] = 'motion-refs');
