# BUG: Khi đăng nhập với passprot local stratergy thì chưa check validate trường username và password từ request body gửi lên => Đã fix

# Bug: Bạn đang gặp vấn đề rất phổ biến khi làm việc với soft delete! Vấn đề là unique constraint ở MongoDB không quan tâm đến isDeleted, nó chỉ check email có trùng hay không trong toàn bộ collection.Constraint unique: true sẽ không cho phép 2 documents có cùng email, bất kể isDeleted là true hay false. => Đã fix
