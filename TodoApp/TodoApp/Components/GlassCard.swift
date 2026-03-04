// UI 전반에서 재사용되는 공통 컴포넌트와 배경 스타일을 정의하는 파일입니다.
// 글래스 모피즘(유리 느낌) 카드, 앱 배경 그라디언트, 16진수 색상 초기화가 포함됩니다.

import SwiftUI

// MARK: - Glass Card Component (iOS 26 Liquid Glass 스타일)

// ✅ 제네릭 컨테이너 뷰: 어떤 뷰든 유리 카드처럼 감쌀 수 있습니다.
// <Content: View>는 "안에 들어올 내용이 뭐든 View 프로토콜을 따라야 한다"는 의미입니다.
// 사용 예: GlassCard { Text("안녕") }
struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = 20  // 카드 모서리 둥근 정도 (기본 20pt)
    var padding: CGFloat = 16       // 카드 내부 여백 (기본 16pt)
    @ViewBuilder var content: () -> Content // 카드 안에 들어갈 내용 (클로저로 전달)

    var body: some View {
        content()
            .padding(padding) // 내용과 카드 테두리 사이의 여백
            .background {
                // ✅ .ultraThinMaterial: 배경을 흐리게(블러) 비치는 시스템 소재
                // 뒤에 있는 내용이 반투명하게 보이는 유리 효과를 만들어 줍니다.
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        // ✅ strokeBorder: 사각형 안쪽에 그라디언트 테두리를 그립니다.
                        // 위-왼쪽은 밝고, 아래-오른쪽은 어둡게 → 유리 빛 반사 느낌
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .strokeBorder(
                                LinearGradient(
                                    colors: [.white.opacity(0.4), .white.opacity(0.1)],
                                    startPoint: .topLeading,    // 좌상단: 밝음
                                    endPoint: .bottomTrailing   // 우하단: 어두움
                                ),
                                lineWidth: 1
                            )
                    }
            }
            // 카드 아래에 부드러운 그림자 효과
            .shadow(color: .black.opacity(0.15), radius: 12, x: 0, y: 4)
    }
}

// MARK: - App Background Gradient

// 앱 전체 배경색 - 어두운 네이비 계열 그라디언트
// 모든 화면에서 ZStack의 맨 아래에 깔립니다.
struct AppBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.10, green: 0.10, blue: 0.18), // 진한 남색 (좌상단)
                Color(red: 0.09, green: 0.13, blue: 0.24), // 중간 남색
                Color(red: 0.06, green: 0.20, blue: 0.38)  // 밝은 남색 (우하단)
            ],
            startPoint: .topLeading,   // 그라디언트 시작: 좌상단
            endPoint: .bottomTrailing  // 그라디언트 끝: 우하단
        )
        .ignoresSafeArea() // Safe Area(노치, 홈 바 등)를 무시하고 전체 화면 채우기
    }
}

// MARK: - Color Helper

// SwiftUI의 Color에 16진수 문자열로 색상을 초기화하는 기능을 추가하는 확장입니다.
extension Color {
    // 사용 예: Color(hex: "#FF5733") 또는 Color(hex: "FF5733")
    init(hex: String) {
        // #, 공백 등 숫자/알파벳이 아닌 문자를 제거해 순수 16진수 문자열로 만듭니다.
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        // 16진수 문자열을 정수로 파싱합니다.
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // 단축 3자리 형식 (예: "F0F") → 각 자리를 두 번 반복한 값으로 변환
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // 일반 6자리 형식 (예: "FF0000") → 알파값 255(불투명)로 고정
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // 알파 포함 8자리 형식 (예: "80FF0000") → 알파값도 파싱
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: // 알 수 없는 형식 → 투명으로 처리
            (a, r, g, b) = (1, 1, 1, 0)
        }
        // 0~255 범위의 정수를 0.0~1.0 범위의 Double로 변환해 Color 초기화
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
