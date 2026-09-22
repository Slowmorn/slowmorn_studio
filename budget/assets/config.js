/* 버짓리스트 설정
   여기 값이 비어 있으면 로그인 기능이 통째로 꺼지고, 사이트는 브라우저 저장만으로 동작합니다.
   두 값 모두 브라우저에 공개되는 값입니다. 실제 보호는 Supabase의 RLS 정책이 합니다. */
window.BUDGET_CONFIG = {
  supabaseUrl: "https://buhbgetanjmlltdccjiw.supabase.co",
  supabaseKey: "sb_publishable_-Z_62k553eqkvRvmkh_GDg_jcGous46",

  // 카카오 로그인 스위치.
  // Supabase는 카카오에 이메일(account_email)까지 요구하는데, 그 동의항목은
  // 비즈니스 앱 전환을 해야 켤 수 있어요. 전환이 끝나면 true 로 바꾸면 됩니다.
  kakao: false
};
