export const SUPPORT_CARD_DEFS = {
  DOI_VAN:        { id: 'DOI_VAN',        name: 'Đổi Vận',          count: 14, timing: 'STEP2',    desc: 'Tung lại tối đa 2 viên xúc xắc bất kỳ trong 4 viên vừa gieo.' },
  BE_KIM:         { id: 'BE_KIM',         name: 'Bẻ Kim Đồng Hồ',   count: 9,  timing: 'STEP3',    desc: 'Đẩy hoặc kéo kim đồng hồ 1 vạch (không kích hoạt kỹ năng/sự kiện vạch mới).' },
  THAN_HANH:      { id: 'THAN_HANH',      name: 'Thần Hành Phù',    count: 14, timing: 'STEP5',    desc: 'Cộng +3 MP vào tổng Điểm Di Chuyển trong lượt này.' },
  VU_KHI:         { id: 'VU_KHI',         name: 'Vũ Khí Bí Mật',    count: 8,  timing: 'COMBAT',   desc: 'Cộng +3 điểm vào tổng xúc xắc chiến đấu của bản thân.' },
  HO_THAN:        { id: 'HO_THAN',        name: 'Hộ Thân Phù',      count: 8,  timing: 'REACTION', desc: 'Chặn 1 lần mất Mệnh Bài từ Giao chiến hoặc Bẫy (không chặn Call Out, cấm ở Mùa Hạ).' },
  SUONG_MU:       { id: 'SUONG_MU',       name: 'Sương Mù Che Mắt', count: 5,  timing: 'CALLOUT',  desc: 'Hủy lượt Call Out của đối thủ; Kỹ năng Ẩn vẫn kích hoạt và không bị lộ.' },
  GIO_MUA:        { id: 'GIO_MUA',        name: 'Gió Mùa',          count: 7,  timing: 'STEP5',    desc: 'Lượt này mọi địa hình hợp lệ chỉ tốn 1 MP và bỏ qua khóa chân Mùa Thu / Ô Lửa.' },
  DICH_CHUYEN:    { id: 'DICH_CHUYEN',    name: 'Dịch Chuyển Ngắn', count: 8,  timing: 'STEP4',    desc: 'Hoán đổi vị trí với người chơi đứng cách tối đa 3 ô (không kích hoạt Giao chiến).' },
  CAM_BAY:        { id: 'CAM_BAY',        name: 'Cạm Bẫy Gai',      count: 7,  timing: 'STEP4',    desc: 'Đặt 1 token Bẫy tại ô đang đứng; người tiếp theo đi qua phải dừng lại.' },
  KHOA_CHIEU:     { id: 'KHOA_CHIEU',     name: 'Khóa Chiêu',       count: 4,  timing: 'STEP4',    desc: 'Chỉ định 1 đối thủ; kỹ năng Thiên/Địa của họ bị khóa hồi chiêu thêm 1 vòng.' },
  DOAT_BAO:       { id: 'DOAT_BAO',       name: 'Đoạt Bảo',         count: 4,  timing: 'STEP4',    desc: 'Cướp ngẫu nhiên 1 Thẻ Hỗ Trợ từ người chơi đang đứng cùng Mùa.' },
  HOI_SINH:       { id: 'HOI_SINH',       name: 'Hồi Sinh Thảo',    count: 8,  timing: 'STEP4',    desc: 'Hồi phục ngay 1 Mệnh Bài (tối đa 3; Mùa Xuân nhân đôi).' }
};

export function createShuffledSupportDeck() {
  const deck = [];
  for (const def of Object.values(SUPPORT_CARD_DEFS)) {
    for (let i = 0; i < def.count; i++) deck.push(def.id);
  }
  return shuffle(deck);
}

export const EVENT_CARDS = [
  { id: 'NHAT_THUC',       name: 'Nhật Thực',          desc: 'Kim đồng hồ quay ngược 6 vạch giờ (không kích hoạt kỹ năng/sự kiện).' },
  { id: 'NGUYET_THUC',     name: 'Nguyệt Thực',        desc: 'Toàn bộ kỹ năng Thiên/Địa đang hồi chiêu của tất cả người chơi lập tức hồi phục.' },
  { id: 'KHE_NUT',         name: 'Khe Nứt Thời Gian',  desc: 'Người kích hoạt sự kiện được tung thêm 1d6 cộng thẳng vào MP lượt này.' },
  { id: 'MUA_LOC',         name: 'Mưa Lộc Đầu Xuân',   desc: 'Tất cả người chơi đứng tại Mùa Xuân và Mùa Hạ được rút 1 Thẻ Hỗ Trợ.' },
  { id: 'THIEN_THACH',     name: 'Thiên Thạch Rơi',    desc: 'Tất cả người chơi đứng trên ô Đồng bằng trống trải bị đẩy lùi 2 ô.' },
  { id: 'BAO_TUYET',       name: 'Bão Tuyết Trái Mùa', desc: 'Trong trọn 1 vòng kế tiếp, mọi ô địa hình hợp lệ tăng thêm +1 MP chi phí.' },
  { id: 'HUYET_CHIEN',     name: 'Huyết Chiến',        desc: 'Người chót bảng lập tức tiến về phía Hạng 1 tối đa +6 ô (đứng sau lưng Hạng 1).' },
  { id: 'THOI_KHONG',      name: 'Thời Không Đảo Lộn', desc: 'Đảo chiều thứ tự đi lượt của cả bàn trong trọn vẹn 1 vòng đấu kế tiếp.' },
  { id: 'DAI_XA',          name: 'Đại Xá Thiên Đình',  desc: 'Mọi người chơi hiện chỉ còn đúng 1 Mệnh Bài được hồi phục ngay 1 Mệnh Bài.' },
  { id: 'CUONG_PHONG',     name: 'Cuồng Phong',        desc: 'Tất cả người chơi cùng tiến +2 ô về phía Đích.' },
  { id: 'SUONG_MU_HL',     name: 'Sương Mù Hỗn Loạn',  desc: 'Mọi người có Thẻ Hỗ Trợ tự động chuyền ngẫu nhiên 1 lá cho người kế tiếp.' },
  { id: 'THIEN_LOI',       name: 'Thiên Lôi Giáng Thế',desc: 'Người Hạng 1 bị đẩy lùi 3 ô (hoặc mất 1 Mệnh Bài nếu đứng đầu quá xa).' }
];

export function createShuffledEventDeck() {
  return shuffle(EVENT_CARDS.map(e => e.id));
}

export function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const ZODIAC_DATA = {
  'Tý': {
    hours: [1, 13], season: 'DONG',
    thien: { name: 'Đêm Tối', type: 'Tức thời', desc: 'Miễn nhiễm mọi hiệu ứng chỉ định và Giao chiến đến hết lượt kế tiếp của Tý.' },
    dia:   { name: 'Đào Hang', type: 'Tự thân', desc: 'Ở lượt mình, thay di chuyển để nhảy tới ngay sau lưng người gần nhất phía trước (tối đa 5 ô).' },
    riddle: '“Kẻ đứng sau lưng gã khổng lồ luôn mỉm cười khi trời tối.”',
    trigger: 'Sau khi Hạng 1 kết thúc di chuyển (hoặc kích hoạt Bước 4).',
    hiddenA: { name: 'Ám Sát Hạng Nhất', desc: 'Nếu trong 3 ô sau Hạng 1, lao tới Giao chiến với +4 điểm (thắng cướp 1 thẻ).' },
    hiddenB: { name: 'Ké Bóng Hoàng Hôn', desc: 'Lập tức tiến +2 ô (+3 ô nếu Hạng 1 vừa dùng kỹ năng).' }
  },
  'Sửu': {
    hours: [2, 14], season: 'DONG',
    thien: { name: 'Thiên Mệnh', type: 'Tự thân', desc: 'Lượt mình luôn +1 MP; nếu chót bảng hoặc kém Hạng 1 từ 4 ô trở lên thì +3 MP.' },
    dia:   { name: 'Cày Đất', type: 'Tức thời', desc: 'Đẩy lùi 1 ô tất cả đối thủ đứng cùng ô hoặc cách 1 ô quanh Sửu.' },
    riddle: '“Càng mang nhiều vết sẹo, bước chân càng không thể lay chuyển.”',
    trigger: 'Khi Sửu bước vào Giao chiến.',
    hiddenA: { name: 'Bất Khuất', desc: '+2 điểm giao chiến mỗi Mệnh Bài đã mất (tối đa +4) và miễn đẩy lùi.' },
    hiddenB: { name: 'Phản Lực Trâu Điên', desc: 'Nếu thua trận, không bị lùi mà tiến +1 ô và đẩy kẻ thắng lùi 2 ô.' }
  },
  'Dần': {
    hours: [3, 15], season: 'XUAN',
    thien: { name: 'Hổ Gầm', type: 'Tức thời', desc: 'Xóa toàn bộ hiệu ứng [Tự thân] đang chờ của người khác; nếu không xóa ai, Dần +2 điểm giao chiến trận tới.' },
    dia:   { name: 'Vồ Mồi', type: 'Tự thân', desc: 'Ở lượt mình, nếu dừng trong phạm vi 2 ô quanh đối thủ, được lao tới giao chiến với +2 điểm.' },
    riddle: '“Chúa sơn lâm không bao giờ săn mồi theo bầy.”',
    trigger: 'Đầu Bước 5 lượt của Dần (trước di chuyển).',
    hiddenA: { name: 'Độc Tôn Giao Chiến', desc: 'Giao chiến 1v1 lượt này (không có người thứ 3 trong 2 ô) nhận +5 điểm chiến đấu.' },
    hiddenB: { name: 'Lãnh Chúa Đơn Độc', desc: 'Nếu không có ai trong phạm vi 2 ô quanh Dần, nhận ngay +4 MP lượt này.' }
  },
  'Mão': {
    hours: [4, 16], season: 'XUAN',
    thien: { name: 'Ảo Ảnh', type: 'Tức thời', desc: 'Hoán đổi vị trí với người gần Mão nhất (nếu người đó gần Đích hơn Mão).' },
    dia:   { name: 'Nhảy Bật', type: 'Tự thân', desc: 'Lượt mình, mỗi đối thủ đi ngang qua/cạnh nhận +2 MP (tối đa 1 lần/đối thủ).' },
    riddle: '“Bóng trăng dưới nước tưởng gần mà hóa xa.”',
    trigger: 'Trước khi di chuyển hoặc bị giao chiến.',
    hiddenA: { name: 'Thế Thân', desc: 'Hủy Giao chiến sắp tới và đẩy kẻ tấn công lùi 2 ô.' },
    hiddenB: { name: 'Huyễn Ảnh', desc: 'Hoán đổi vị trí với 1 đối thủ đứng cách Mão từ 2 đến 4 ô.' }
  },
  'Thìn': {
    hours: [5, 17], season: 'XUAN',
    thien: { name: 'Hô Mưa Gọi Gió', type: 'Toàn cục', desc: 'Đảo chiều đi lượt cả bàn đến khi lượt quay lại Thìn.' },
    dia:   { name: 'Long Uy', type: 'Tức thời', desc: 'Đặt token Vùng Cấm tại ô Thìn đang đứng; người tiếp theo đi qua phải dừng lại.' },
    riddle: '“Khi bầu trời đổi chiều, kẻ phàm trần phải cúi đầu.”',
    trigger: 'Tại Bước 4, sau khi kim đồng hồ dừng lại.',
    hiddenA: { name: 'Thiên Phạt', desc: 'Mọi đối thủ cùng Mùa với Thìn bị đẩy lùi 2 ô và mất 1 Mệnh Bài (nếu trên 1 HP).' },
    hiddenB: { name: 'Nghịch Chuyển Càn Khôn', desc: 'Mọi đối thủ khác Mùa với Thìn lùi 2 ô và đảo chiều đi lượt cả bàn.' }
  },
  'Tỵ': {
    hours: [6, 18], season: 'HA',
    thien: { name: 'Lột Xác', type: 'Tự thân', desc: 'Xóa mọi hiệu ứng bất lợi trên người và rút ngay 1 Thẻ Hỗ Trợ.' },
    dia:   { name: 'Nọc Độc', type: 'Tức thời', desc: 'Đặt token Độc tại ô hiện tại; người dẫm phải bị -3 MP ở lượt kế tiếp.' },
    riddle: '“Nụ hôn ngọt ngào nhất luôn giấu nọc độc ở sau.”',
    trigger: 'Khi bắt đầu Giao chiến với Tỵ.',
    hiddenA: { name: 'Độc Tâm', desc: 'Tỵ chủ động Nhường (không bị đẩy lùi); kẻ thắng mất 1 Mệnh Bài và bị -3 MP lượt sau.' },
    hiddenB: { name: 'Răng Nanh Ngầm', desc: 'Giao chiến bình thường; đối thủ bị cấm dùng thẻ trận này và -3 MP lượt kế tiếp.' }
  },
  'Ngọ': {
    hours: [7, 19], season: 'HA',
    thien: { name: 'Thiên Mã', type: 'Tự thân', desc: 'Ở lượt mình, nếu nhóm Di chuyển là 1 đôi (2 viên giống nhau), nhận +4 MP.' },
    dia:   { name: 'Nước Đại', type: 'Tự thân', desc: 'Lượt mình đi xuyên bẫy, bỏ qua bất lợi Mùa và mọi địa hình chỉ tốn 1 MP.' },
    riddle: '“Vó ngựa chỉ thực sự phát điên khi không còn đường lui.”',
    trigger: 'Đầu Bước 5 lượt của Ngọ (trước di chuyển).',
    hiddenA: { name: 'Thiết Kỵ Càn Quét', desc: 'Bỏ qua khóa chân khi đi qua người khác và hất văng 1 người gần nhất lùi 2 ô.' },
    hiddenB: { name: 'Đốt Mạng Bứt Tốc', desc: 'Hy sinh 1 Mệnh Bài (khi còn ≥ 2) để nhân đôi tổng MP trong lượt này.' }
  },
  'Mùi': {
    hours: [8, 20], season: 'HA',
    thien: { name: 'Cầu Nguyện', type: 'Tức thời', desc: 'Mùi và 1 người chơi gần Mùi nhất cùng tiến thêm +1 ô.' },
    dia:   { name: 'Bầy Đàn', type: 'Tự thân', desc: 'Nếu kết thúc lượt di chuyển cùng ô hoặc cách 1 ô với người khác, rút 1 Thẻ Hỗ Trợ.' },
    riddle: '“Khi hai kẻ yếu đứng cạnh nhau, kẻ mạnh nhất phải trả giá.”',
    trigger: 'Khi đứng cùng ô hoặc cách 1 ô với người khác (không phải Hạng 1).',
    hiddenA: { name: 'Đồng Minh Kẻ Yếu', desc: 'Bỏ qua Giao chiến; ép người Hạng 1 lập tức mất 1 Mệnh Bài.' },
    hiddenB: { name: 'Cộng Hưởng Bầy Đàn', desc: 'Bỏ qua Giao chiến; Mùi và đồng minh đó cùng tiến thêm +2 ô.' }
  },
  'Thân': {
    hours: [9, 21], season: 'THU',
    thien: { name: 'Thiên Biến', type: 'Tức thời', desc: 'Sao chép hiệu ứng kỹ năng Thiên gần nhất (không sao chép Toàn cục); nếu chưa có, nhận +2 MP.' },
    dia:   { name: 'Trộm Đào', type: 'Tức thời', desc: 'Cướp ngẫu nhiên 1 Thẻ Hỗ Trợ từ người gần Thân nhất; nếu không có thẻ, đẩy lùi họ 1 ô.' },
    riddle: '“Chiếc gương phản chiếu chính xác lưỡi đao vừa vung lên.”',
    trigger: 'Trong Giao chiến hoặc Bước 4.',
    hiddenA: { name: 'Gương Phản Chiếu', desc: 'Nhận +3 điểm giao chiến và cướp 1 Thẻ Hỗ Trợ từ đối thủ gần nhất.' },
    hiddenB: { name: 'Bắt Chước Tuyệt Đối', desc: 'Sao chép chỉ số cộng thêm của đối thủ trong trận và nhận +2 điểm chiến đấu.' }
  },
  'Dậu': {
    hours: [10, 22], season: 'THU',
    thien: { name: 'Bình Minh', type: 'Tức thời', desc: 'Đẩy kim đồng hồ +1 vạch (không kích hoạt vạch mới) và rút ngay 1 Thẻ Hỗ Trợ.' },
    dia:   { name: 'Gáy Sáng', type: 'Tức thời', desc: 'Xóa toàn bộ token bẫy trên bàn; Dậu tiến +1 ô mỗi bẫy (tối đa +3, tối thiểu +1).' },
    riddle: '“Tiếng gáy vang lên xé toạc màn đêm của kẻ gian dối.”',
    trigger: 'Đầu lượt hoặc Bước 4 của Dậu.',
    hiddenA: { name: 'Phá Án', desc: 'Miễn phạt Call Out sai đến lượt sau và tiến ngay +1 ô.' },
    hiddenB: { name: 'Ánh Sáng Sự Thật', desc: 'Lộ bí mật biến thể A/B của 1 đối thủ và rút ngay 1 Thẻ Hỗ Trợ.' }
  },
  'Tuất': {
    hours: [11, 23], season: 'THU',
    thien: { name: 'Trung Nghĩa', type: 'Tức thời', desc: 'Chọn đồng minh (người gần Đích hơn); Tuất lập tức tiến +2 ô theo dấu họ.' },
    dia:   { name: 'Canh Gác', type: 'Tức thời', desc: 'Tạo lá chắn +3 điểm giao chiến cho trận gần nhất trước lượt kế tiếp.' },
    riddle: '“Kẻ xâm phạm lãnh địa sẽ phải trả giá bằng máu.”',
    trigger: 'Khi có đối thủ trong phạm vi 1 ô quanh Tuất (hoặc Bước 4).',
    hiddenA: { name: 'Phục Kích Biên Giới', desc: 'Đối thủ trong 1 ô quanh Tuất mất 1 Mệnh Bài và bị đẩy lùi 1 ô.' },
    hiddenB: { name: 'Vùng Bất Khả Xâm Phạm', desc: 'Đẩy lùi mọi đối thủ trong 2 ô quanh Tuất ra xa 2 ô.' }
  },
  'Hợi': {
    hours: [12, 24], season: 'DONG',
    thien: { name: 'Phúc Lộc', type: 'Tự thân', desc: 'Ở Bước 2 lượt mình, được tung lại miễn phí tối đa 2 viên xúc xắc.' },
    dia:   { name: 'An Nhàn', type: 'Tự thân', desc: 'Nếu trong lượt mình di chuyển tối đa 2 ô (hoặc đứng yên), hồi 1 Mệnh Bài (tối đa 3).' },
    riddle: '“Kẻ ngủ say giữa chiến trường lại là kẻ sống sót cuối cùng.”',
    trigger: 'Khi có đối thủ kích hoạt Giao chiến với Hợi (hoặc Bước 4).',
    hiddenA: { name: 'Giấc Ngủ Vàng', desc: 'Hủy Giao chiến; Hợi hồi 1 Mệnh Bài (tối đa 3) và đẩy kẻ tấn công lùi 1 ô.' },
    hiddenB: { name: 'Mộng Du', desc: 'Hủy Giao chiến; Hợi cướp ngẫu nhiên 1 Thẻ Hỗ Trợ và tự tiến thêm +1 ô.' }
  }
};
